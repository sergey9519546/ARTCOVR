import { expect, test, type Locator, type Page } from "@playwright/test";
import { accountFixture, fixtureImage, fulfillJson, useDeterministicSignIn } from "./fixtures";

const photo = { name: "artist.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") };

async function expectBorderlessFocusedPrompt(prompt: Locator) {
  await prompt.focus();
  expect(await prompt.evaluate((element) => {
    const style = getComputedStyle(element);
    return { border: style.borderTopWidth, outline: style.outlineWidth, shadow: style.boxShadow };
  })).toEqual({ border: "0px", outline: "0px", shadow: "none" });
}

async function mockGeneration(page: Page) {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/functions/v1/generate-image", async (route) => {
    requests.push(route.request().postDataJSON());
    await fulfillJson(route, { generationId: `edit-${requests.length}`, status: "running", statusUrl: "/unused" }, 202);
  });
  await page.route("**/api/functions/v1/generation-status?*", (route) => fulfillJson(route, {
    generationId: new URL(route.request().url()).searchParams.get("generationId"),
    status: "succeeded", previewUrl: fixtureImage, errorCode: null, finishedAt: new Date().toISOString(),
  }));
  return requests;
}

async function openPurchased(page: Page, selectedPreviewOnly = false) {
  await useDeterministicSignIn(page);
  const account = accountFixture();
  account.purchases[0].remainingGenerations = 8;
  if (selectedPreviewOnly) account.generations = [];
  account.downloads.push({ ...account.downloads[1], kind: "selected_preview", generationId: "generation-preview" });
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
  await page.route("**/api/functions/v1/my-images", (route) => fulfillJson(route, account));
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });
  return page.getByRole("region", { name: "Edit Buried Clocks", exact: true });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`preview sends current artwork plus supplementary photo and resets explicitly at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await useDeterministicSignIn(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests = await mockGeneration(page);
    let finishUpload: (() => void) | undefined;
    await page.route("**/api/functions/v1/upload-reference?*", async (route) => {
      expect(route.request().headers()["content-type"]).toBe("image/png");
      expect(route.request().postDataBuffer()).toEqual(photo.buffer);
      await new Promise<void>((resolve) => { finishUpload = resolve; });
      await fulfillJson(route, { referenceUploadId: "artist-photo" }, 201);
    });
    await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
    const studio = page.getByRole("region", { name: "Make it yours." });
    const prompt = page.getByLabel("Describe your edit");
    const generate = page.getByRole("button", { name: "Generate image", exact: true });
    await prompt.fill("Put a silver moon into this cover");
    await expectBorderlessFocusedPrompt(prompt);
    await generate.click();
    await expect(page.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[0].artworkId).toBeTruthy();
    expect(requests[0].referenceGenerationId).toBeUndefined();
    expect(requests[0].referenceUploadId).toBeUndefined();

    await prompt.fill("Place me beside the moon, keeping the cover as the scene");
    await page.locator('input[type="file"]').setInputFiles(photo);
    await expect(page.getByText("Uploading…", { exact: true })).toBeVisible();
    await expect(generate).toBeDisabled();
    finishUpload!();
    await expect(page.getByText("artist.png", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Add cover text", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("NIGHT / 01");
    await page.getByLabel("Artist name", { exact: true }).fill("A.R.T. & Me");
    await generate.click();
    await expect(page.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[1]).toMatchObject({ artworkId: requests[0].artworkId, referenceGenerationId: "edit-1", referenceUploadId: "artist-photo", resetToBase: false, coverText: { title: "NIGHT / 01", artistName: "A.R.T. & Me" } });
    await expect(page.getByText("artist.png", { exact: true })).toHaveCount(0);

    await prompt.fill("Keep me in the scene and add red flowers");
    await generate.click();
    await expect(page.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[2].referenceGenerationId).toBe("edit-2");
    expect(requests[2].referenceUploadId).toBeUndefined();
    await studio.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(prompt).toHaveValue("");
    await prompt.fill("Change the original sky to blue");
    await generate.click();
    await expect(page.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[3]).toMatchObject({ artworkId: requests[0].artworkId, resetToBase: true });
    expect(requests[3].referenceGenerationId).toBeUndefined();
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(4);
    await expectBorderlessFocusedPrompt(prompt);
    await studio.screenshot({ path: testInfo.outputPath(`preview-${viewport.width}.png`) });
    await studio.locator(".artcovr-promptbar").screenshot({ path: testInfo.outputPath(`preview-prompt-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });

  test(`purchased canvas supports photo plus selected version and original reset at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests = await mockGeneration(page);
    await page.route("**/api/functions/v1/upload-reference?*", (route) => fulfillJson(route, { referenceUploadId: "paid-photo" }, 201));
    const studio = await openPurchased(page);
    const source = studio.getByLabel("Starting image");
    const prompt = studio.getByLabel("Image-edit prompt");
    const generate = studio.getByRole("button", { name: "Generate image", exact: true });
    await expect(source).toHaveValue("generation-purchased");
    await studio.getByLabel("Add your photo").setInputFiles(photo);
    await expect(studio.getByText("artist.png", { exact: true })).toBeVisible();
    await prompt.fill("Place the person in my current cover");
    await expectBorderlessFocusedPrompt(prompt);
    await generate.click();
    await expect(studio.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[0]).toMatchObject({ artworkId: "art_382f017ddadad8dcd971", purchaseId: "purchase-e2e", referenceGenerationId: "generation-purchased", referenceUploadId: "paid-photo" });

    await source.selectOption("generation-preview");
    await prompt.fill("Edit the preview I purchased instead");
    await generate.click();
    await expect(studio.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[1].referenceGenerationId).toBe("generation-preview");

    await source.selectOption("generation-purchased");
    await prompt.fill("Edit this earlier version again");
    await generate.click();
    await expect(studio.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[2].referenceGenerationId).toBe("generation-purchased");

    await studio.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(source).toHaveValue("original");
    await prompt.fill("Make the original moon golden");
    await generate.click();
    await expect(studio.getByText(/Generated image ready/)).toBeVisible();
    expect(requests[3].resetToBase).toBe(true);
    expect(requests[3].referenceGenerationId).toBeUndefined();
    await expectBorderlessFocusedPrompt(prompt);
    await studio.screenshot({ path: testInfo.outputPath(`purchased-${viewport.width}.png`) });
    await studio.locator(".artcovr-promptbar").screenshot({ path: testInfo.outputPath(`purchased-prompt-${viewport.width}.png`) });
    expect(errors).toEqual([]);
  });
}

test("first purchased edit uses the purchased preview ID when no paid results exist", async ({ page }) => {
  const requests = await mockGeneration(page);
  const studio = await openPurchased(page, true);
  await expect(studio.getByLabel("Starting image")).toHaveValue("generation-preview");
  await studio.getByLabel("Image-edit prompt").fill("Add flowers to the cover I purchased");
  await studio.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(studio.getByText(/Generated image ready/)).toBeVisible();
  expect(requests[0].referenceGenerationId).toBe("generation-preview");
});

test("lost admission response resumes the identical edit and prevents a second edit", async ({ page }) => {
  await useDeterministicSignIn(page);
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/functions/v1/generate-image", async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) { await route.abort("failed"); return; }
    await fulfillJson(route, { generationId: "accepted-before-disconnect", status: "running", statusUrl: "/unused" }, 202);
  });
  await page.route("**/api/functions/v1/generation-status?*", (route) => fulfillJson(route, { generationId: "accepted-before-disconnect", status: "succeeded", previewUrl: fixtureImage, errorCode: null, finishedAt: new Date().toISOString() }));
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  const prompt = page.getByLabel("Describe your edit");
  await prompt.fill("Add a violet moon to my cover");
  await page.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Resume generation");
  await expect(prompt).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Resume generation", exact: true }).click();
  await expect(page.getByText(/Generated image ready/)).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await expect(prompt).toBeEnabled();
});

test("poll transport loss resumes the accepted job without submitting again", async ({ page }) => {
  const requests = await mockGeneration(page);
  let polls = 0;
  await page.route("**/api/functions/v1/generation-status?*", async (route) => {
    polls += 1;
    if (polls === 1) { await route.abort("failed"); return; }
    await fulfillJson(route, { generationId: "edit-1", status: "succeeded", previewUrl: fixtureImage, errorCode: null, finishedAt: new Date().toISOString() });
  });
  const studio = await openPurchased(page);
  await studio.getByLabel("Image-edit prompt").fill("Add a moon to my existing result");
  await studio.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(studio.getByRole("alert")).toContainText("Resume generation");
  await studio.getByRole("button", { name: "Resume generation", exact: true }).click();
  await expect(studio.getByText(/Generated image ready/)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("terminal failure permits a fresh request rather than repolling the failed job", async ({ page }) => {
  await useDeterministicSignIn(page);
  const requests = await mockGeneration(page);
  await page.route("**/api/functions/v1/generation-status?*", (route) => fulfillJson(route, { generationId: "edit-1", status: "failed", errorCode: "provider_failure", finishedAt: new Date().toISOString() }));
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Describe your edit").fill("Change the artwork lighting");
  await page.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your allowance was not used");
  await page.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
});

test("prompt field grows to its cap and shrinks after multiline text is cleared", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useDeterministicSignIn(page);
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  const prompt = page.getByLabel("Describe your edit");
  await prompt.fill("Start here");
  const initialHeight = await prompt.evaluate((element) => element.getBoundingClientRect().height);
  expect(initialHeight).toBeGreaterThanOrEqual(48);
  await prompt.press("Shift+Enter");
  await expect(prompt).toHaveValue("Start here\n");
  await prompt.fill(Array.from({ length: 30 }, (_, index) => `Line ${index}: add flowers`).join("\n"));
  await expect.poll(() => prompt.evaluate((element) => element.getBoundingClientRect().height)).toBe(240);
  await prompt.fill("");
  await expect.poll(() => prompt.evaluate((element) => element.getBoundingClientRect().height)).toBe(initialHeight);
});

import { expect, test, type Page } from "@playwright/test";
import { accountFixture, fixtureImage, fulfillJson, useDeterministicSignIn } from "./fixtures";

const photo = { name: "artist.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") };

async function prepareEditor(page: Page) {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/my-images", (route) => fulfillJson(route, { purchases: [], generations: [], downloads: [] }));
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  return page.getByRole("region", { name: "Make it yours.", exact: true });
}

test("preview draft and cover text survive leaving the editor and returning", async ({ page }) => {
  let studio = await prepareEditor(page);
  await studio.getByLabel("Describe your edit").fill("Preserve the drawing and add violet moonlight");
  await studio.getByRole("button", { name: "Add cover text", exact: true }).click();
  await studio.getByLabel("Title", { exact: true }).fill("NIGHT / 01");
  await studio.getByLabel("Artist name", { exact: true }).fill("A.R.T. & Me");
  await studio.getByText("Expand", { exact: true }).click();
  await page.goto("/sign-in?redirect_url=%2Fproduct%2Fcart-of-hours", { waitUntil: "domcontentloaded" });
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  studio = page.getByRole("region", { name: "Make it yours.", exact: true });
  await expect(studio.getByLabel("Describe your edit")).toHaveValue("Preserve the drawing and add violet moonlight");
  await expect(studio.getByLabel("Title", { exact: true })).toHaveValue("NIGHT / 01");
  await expect(studio.getByLabel("Artist name", { exact: true })).toHaveValue("A.R.T. & Me");
  await expect(studio.getByRole("radio", { name: "Expand", exact: true })).toBeChecked();
  await studio.getByRole("button", { name: "Reset", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Describe your edit")).toHaveValue("");
  await expect(page.getByRole("radio", { name: "Exact style", exact: true })).toBeChecked();
});

test("SPA artwork navigation starts from the new cover without the previous result or photo", async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/functions/v1/generate-image", async (route) => {
    requests.push(route.request().postDataJSON());
    await fulfillJson(route, { generationId: `edit-${requests.length}`, status: "running", statusUrl: "/unused" }, 202);
  });
  await page.route("**/api/functions/v1/generation-status?*", (route) => fulfillJson(route, {
    generationId: new URL(route.request().url()).searchParams.get("generationId"), status: "succeeded", previewUrl: fixtureImage, errorCode: null, finishedAt: new Date().toISOString(),
  }));
  await page.route("**/api/functions/v1/upload-reference?*", (route) => fulfillJson(route, { referenceUploadId: "first-cover-photo" }, 201));
  const studio = await prepareEditor(page);
  await studio.getByLabel("Describe your edit").fill("Add violet moonlight to this cover");
  await studio.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(studio.getByText(/Generated image ready/)).toBeVisible();
  await studio.locator('input[type="file"]').setInputFiles(photo);
  await expect(studio.getByText("artist.png", { exact: true })).toBeVisible();
  const related = page.getByRole("region", { name: "Find similar", exact: true }).locator('a[href^="/product/"]').first();
  const nextHref = await related.getAttribute("href");
  await related.click();
  await expect(page).toHaveURL(new RegExp(`${nextHref}/?$`));
  await expect(studio.getByLabel("Describe your edit")).toHaveValue("");
  await expect(studio.getByText("artist.png", { exact: true })).toHaveCount(0);
  await expect(studio.getByRole("button", { name: "Back to the original artwork", exact: true })).toHaveCount(0);
  await studio.getByLabel("Describe your edit").fill("Keep this new composition and add silver rain");
  await studio.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].artworkId).not.toBe(requests[0].artworkId);
  expect(requests[1].referenceGenerationId).toBeUndefined();
  expect(requests[1].referenceUploadId).toBeUndefined();
});

test("removing an uploading photo keeps its late response out of the next edit", async ({ page }) => {
  let finishUpload: (() => void) | undefined;
  await page.route("**/api/functions/v1/upload-reference?*", async (route) => {
    await new Promise<void>((resolve) => { finishUpload = resolve; });
    await fulfillJson(route, { referenceUploadId: "cancelled-photo" }, 201);
  });
  const requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/functions/v1/generate-image", async (route) => {
    requests.push(route.request().postDataJSON());
    await fulfillJson(route, { generationId: "cover-only", status: "running", statusUrl: "/unused" }, 202);
  });
  await page.route("**/api/functions/v1/generation-status?*", (route) => fulfillJson(route, {
    generationId: "cover-only", status: "succeeded", previewUrl: fixtureImage, errorCode: null, finishedAt: new Date().toISOString(),
  }));
  const studio = await prepareEditor(page);
  await studio.getByLabel("Describe your edit").fill("Keep this cover and add silver rain");
  await studio.locator('input[type="file"]').setInputFiles(photo);
  await expect(studio.getByText("Uploading…", { exact: true })).toBeVisible();
  await expect.poll(() => Boolean(finishUpload)).toBe(true);
  await studio.getByRole("button", { name: "Remove the reference photo", exact: true }).click();
  finishUpload!();
  await studio.getByRole("button", { name: "Generate image", exact: true }).click();
  await expect(studio.getByText(/Generated image ready/)).toBeVisible();
  expect(requests[0].referenceUploadId).toBeUndefined();
  await expect(studio.getByText("artist.png", { exact: true })).toHaveCount(0);
});

test("choosing the original purchased image preserves the edit while Reset clears it", async ({ page }) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
  await page.route("**/api/functions/v1/my-images", (route) => fulfillJson(route, accountFixture()));
  await page.route("**/api/functions/v1/upload-reference?*", (route) => fulfillJson(route, { referenceUploadId: "artist-photo" }, 201));
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });
  const studio = page.getByRole("region", { name: "Edit Buried Clocks", exact: true });
  const prompt = studio.getByLabel("Image-edit prompt");
  await prompt.fill("Add my portrait beside the moon");
  await studio.getByLabel("Title", { exact: true }).fill("MOONLIGHT");
  await studio.getByLabel("Add your photo").setInputFiles(photo);
  await expect(studio.getByText("artist.png", { exact: true })).toBeVisible();
  await studio.getByLabel("Starting image").selectOption("original");
  await expect(prompt).toHaveValue("Add my portrait beside the moon");
  await expect(studio.getByLabel("Title", { exact: true })).toHaveValue("MOONLIGHT");
  await expect(studio.getByText("artist.png", { exact: true })).toBeVisible();
  await studio.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(prompt).toHaveValue("");
  await expect(studio.getByLabel("Title", { exact: true })).toHaveValue("");
  await expect(studio.getByText("artist.png", { exact: true })).toHaveCount(0);
});

test("a failed photo upload announces the error and permits the same file to be selected again", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/functions/v1/upload-reference?*", async (route) => {
    uploads += 1;
    if (uploads === 1) {
      await fulfillJson(route, { message: "Your photo could not be uploaded. Try again." }, 503);
      return;
    }
    await fulfillJson(route, { referenceUploadId: "retried-photo" }, 201);
  });
  const studio = await prepareEditor(page);
  const input = studio.locator('input[type="file"]');
  await input.setInputFiles(photo);
  await expect(studio.getByRole("alert")).toContainText("Try again");
  await expect(input).toHaveValue("");
  await input.setInputFiles(photo);
  await expect(studio.getByText("artist.png", { exact: true })).toBeVisible();
  expect(uploads).toBe(2);
});

test("suggestions cannot grow the prompt past 2000 characters", async ({ page }) => {
  const studio = await prepareEditor(page);
  const prompt = studio.getByLabel("Describe your edit");
  await prompt.fill("x".repeat(2000));
  await expect(studio.getByRole("button", { name: /^Keep composition, change palette/ })).toBeDisabled();
  await expect(prompt).toHaveValue("x".repeat(2000));
  await prompt.fill("Keep  my lettering\nUse this composition.");
  const suggestion = studio.getByRole("button", { name: /^Keep composition, change palette/ });
  await suggestion.click();
  await suggestion.click();
  await expect(prompt).toHaveValue("Keep  my lettering\nUse this composition.");
});

import { expect, test } from "@playwright/test";
import { fulfillJson } from "./fixtures";

test("archive order names contain the current visible label", async ({ page }) => {
  await page.goto("/archive");
  const order = page.locator(".discovery-order-current");
  for (const label of ["Curated", "Visual variety", "Title A–Z"]) {
    await expect(order).toHaveText(label);
    await expect(order).toHaveAccessibleName(`${label} — change artwork order`);
    await order.click();
  }
  await expect(order).toHaveAccessibleName("Curated — change artwork order");
  await page.getByRole("searchbox").fill("blue");
  await expect(order).toHaveAccessibleName("Search relevance — change artwork order");
});

test("public studio photo names match visible labels before and after attaching", async ({ page }) => {
  await page.route("**/api/functions/v1/upload-reference?*", (route) =>
    fulfillJson(route, { referenceUploadId: "accessibility-photo" }, 201));
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  const studio = page.getByRole("region", { name: "Make it yours.", exact: true });
  const addPhoto = studio.getByRole("button", { name: "Add your photo as a reference", exact: true });
  await expect(addPhoto).toBeEnabled();
  await expect(addPhoto).toHaveText("+Add your photo");
  const chooser = page.waitForEvent("filechooser");
  await addPhoto.click();
  await (await chooser).setFiles({
    name: "artist.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64"),
  });
  const attached = studio.getByRole("button", { name: "Photo attached — replace it", exact: true });
  await expect(attached).toBeEnabled();
  await expect(attached).toHaveText("+Photo attached");
  await studio.getByRole("button", { name: "Remove the reference photo" }).click();
  await expect(addPhoto).toBeEnabled();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`public style radios show keyboard focus separately from selection in ${colorScheme} mode`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, colorScheme);
    const studio = page.getByRole("region", { name: "Make it yours.", exact: true });
    const exact = studio.getByRole("radio", { name: "Exact style", exact: true });
    const expand = studio.getByRole("radio", { name: "Expand", exact: true });
    await expect(exact).toBeChecked();
    await expect(exact).toBeEnabled();
    await studio.getByRole("button", { name: "Add cover text", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(exact).toBeFocused();
    const exactPill = exact.locator("..");
    const expandPill = expand.locator("..");
    await expect(exactPill).toHaveCSS("outline-style", "solid");
    await expect(exactPill).toHaveCSS("outline-width", "2px");
    await expect(exactPill).toHaveCSS("outline-offset", "4px");
    await expect(expandPill).toHaveCSS("outline-style", "none");
    await page.keyboard.press("ArrowRight");
    await expect(expand).toBeFocused();
    await expect(expand).toBeChecked();
    await expect(expandPill).toHaveCSS("outline-style", "solid");
    await expect(expandPill).toHaveCSS("opacity", "1");
    await expect(exactPill).toHaveCSS("outline-style", "none");
    await studio.screenshot({ path: testInfo.outputPath(`style-focus-${colorScheme}.png`) });
    await page.keyboard.press("Tab");
    await expect(expandPill).toHaveCSS("outline-style", "none");
  });
}

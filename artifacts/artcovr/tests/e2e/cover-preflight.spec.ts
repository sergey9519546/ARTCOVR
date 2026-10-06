import { expect, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);

test("public cover preflight reports separate checks for selected platforms", async ({ page }) => {
  await page.goto("/guides/spotify-apple-music-cover-art-requirements");

  const fileInput = page.getByTestId("input-cover-preflight-file");
  await fileInput.setInputFiles({
    name: "release-cover.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByTestId("text-cover-preflight-selected-file"))
    .toContainText("release-cover.png");
  await expect(page.getByTestId("checkbox-cover-preflight-spotify")).toBeChecked();
  await expect(page.getByTestId("checkbox-cover-preflight-apple-music")).toBeChecked();

  await page.getByTestId("button-run-cover-preflight").click();
  const results = page.getByTestId("status-cover-preflight-results");
  await expect(results).toContainText("Preflight is not a guarantee of acceptance.");
  await expect(page.getByTestId("section-cover-preflight-spotify")).toContainText("Spotify");
  await expect(page.getByTestId("section-cover-preflight-spotify")).toContainText("Pixel dimensions");
  await expect(page.getByTestId("section-cover-preflight-apple-music")).toContainText("Apple Music");

  await page.getByTestId("checkbox-cover-preflight-spotify").uncheck();
  await page.getByTestId("button-run-cover-preflight").click();
  await expect(page.getByTestId("section-cover-preflight-apple-music")).toBeVisible();
  await expect(page.getByTestId("section-cover-preflight-spotify")).toHaveCount(0);
});

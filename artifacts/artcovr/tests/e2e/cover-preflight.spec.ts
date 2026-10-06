import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);

function fixtureBuffer(filename: string) {
  return readFileSync(new URL(`../../tests/fixtures/cover-preflight/${filename}`, import.meta.url));
}

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

test("editor export metadata is visible in the browser preflight", async ({ page }) => {
  await page.goto("/guides/spotify-apple-music-cover-art-requirements");
  await page.getByTestId("input-cover-preflight-file").setInputFiles({
    name: "image-editor-profile-orientation.png",
    mimeType: "image/png",
    buffer: fixtureBuffer("image-editor-profile-orientation.png"),
  });
  await page.getByTestId("button-run-cover-preflight").click();

  const results = page.getByTestId("status-cover-preflight-results");
  const spotify = page.getByTestId("section-cover-preflight-spotify");
  await expect(results).toContainText("Detected PNG · 36 × 36 px");
  await expect(spotify.getByTestId("status-cover-preflight-check-color-profile"))
    .toContainText("embedded ICC profile was found");
  await expect(spotify.getByTestId("status-cover-preflight-check-orientation-metadata"))
    .toContainText("orientation tag was found");
});

test("browser preflight flags animation, truncation, and unsupported image formats", async ({ page }) => {
  await page.goto("/guides/spotify-apple-music-cover-art-requirements");
  const fileInput = page.getByTestId("input-cover-preflight-file");

  await fileInput.setInputFiles({
    name: "animated.gif",
    mimeType: "image/gif",
    buffer: fixtureBuffer("animated.gif"),
  });
  await page.getByTestId("button-run-cover-preflight").click();
  await expect(page.getByTestId("section-cover-preflight-apple-music")
    .getByTestId("status-cover-preflight-check-animation"))
    .toContainText("Multiple image frames or animation markers were detected");

  await fileInput.setInputFiles({
    name: "truncated.jpg",
    mimeType: "image/jpeg",
    buffer: fixtureBuffer("truncated.jpg"),
  });
  await page.getByTestId("button-run-cover-preflight").click();
  await expect(page.getByTestId("section-cover-preflight-spotify")
    .getByTestId("status-cover-preflight-check-file-integrity"))
    .toContainText("file appears incomplete");

  await fileInput.setInputFiles({
    name: "unsupported.webp",
    mimeType: "image/webp",
    buffer: fixtureBuffer("unsupported.webp"),
  });
  await page.getByTestId("button-run-cover-preflight").click();
  await expect(page.getByTestId("section-cover-preflight-spotify")
    .getByTestId("status-cover-preflight-check-format"))
    .toContainText("WEBP is not listed");
});

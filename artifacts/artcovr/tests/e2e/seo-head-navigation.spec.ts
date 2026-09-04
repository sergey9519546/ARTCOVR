import { expect, test, type Page } from "@playwright/test";
import {
  displayArtworks,
  displayGenreLabel,
  getArtworkGenres,
} from "../../src/lib/artcovr/artworks";
import {
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "../../src/lib/artcovr/route-metadata";
import { assertUsablePage } from "./fixtures";

const siteUrl = "";

test.use({ reducedMotion: "reduce" });

function expectedHead(path: string) {
  const metadata = getRouteMetadata(path, displayArtworks, (artwork) =>
    getArtworkGenres(artwork).map(displayGenreLabel),
  );
  return getSocialPreviewMetadata(metadata, siteUrl);
}

async function assertRouteHead(page: Page, path: string) {
  const social = expectedHead(path);
  const expectedResolvedCanonical = new URL(social.canonical, page.url()).toString();
  const expectedResolvedImage = new URL(social.imageUrl, page.url()).toString();

  await expect(page).toHaveTitle(social.title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    social.description,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    social.title,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    social.description,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    social.canonical,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    social.imageUrl,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveJSProperty(
    "href",
    expectedResolvedCanonical,
  );
  await expect(page.locator('link[rel="image_src"]')).toHaveJSProperty(
    "href",
    expectedResolvedImage,
  );
}

test("updates shared preview metadata after client-side public navigation", async ({
  page,
}) => {
  let documentNavigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document") {
      documentNavigations += 1;
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await assertUsablePage(page);
  await assertRouteHead(page, "/");

  await page.locator('a[href="/about"]').first().click();
  await expect(page).toHaveURL(/\/about$/);
  await assertUsablePage(page);
  await assertRouteHead(page, "/about");

  await page.locator('a[href="/archive"]').first().click();
  await expect(page).toHaveURL(/\/archive$/);
  await assertUsablePage(page);
  await assertRouteHead(page, "/archive");

  const productLink = page
    .locator('section[aria-label="Artwork archive"] a[href^="/product/"]')
    .first();
  await expect(productLink).toBeVisible();
  await productLink.click();
  const productPath = new URL(page.url()).pathname;
  await expect(page).toHaveURL(/\/product\/[^/]+$/);
  await assertUsablePage(page);
  await assertRouteHead(page, productPath);

  await page.locator('a[href="/archive"]').first().click();
  await expect(page).toHaveURL(/\/archive$/);
  await assertUsablePage(page);
  await assertRouteHead(page, "/archive");

  expect(documentNavigations).toBe(1);
});
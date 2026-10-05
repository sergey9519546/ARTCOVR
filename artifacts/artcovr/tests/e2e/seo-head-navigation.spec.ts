import { expect, test, type Page } from "@playwright/test";
import {
  displayArtworks,
  featuredArtworks,
  displayGenreLabel,
  getArtworkGenres,
} from "../../src/lib/artcovr/artworks";
import {
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "../../src/lib/artcovr/route-metadata";
import { buildRouteStructuredData } from "../../src/lib/artcovr/route-structured-data";
import { renderStaticRoute } from "../../src/lib/artcovr/static-render";
import { ANSWER_GUIDE_BY_PATH } from "../../src/lib/artcovr/answer-guides";
import { assertUsablePage } from "./fixtures";

const siteUrl = "";
const getGenres = (artwork: (typeof displayArtworks)[number]) =>
  getArtworkGenres(artwork).map(displayGenreLabel);

function schemaContext(path: string) {
  return {
    artworks: displayArtworks,
    homepageArtworks: featuredArtworks.slice(0, 12),
    siteUrl,
    metadata: getRouteMetadata(path, displayArtworks, getGenres),
    getGenres,
  };
}

async function assertRouteSchema(page: Page, path: string) {
  const script = page.locator('head script[data-artcovr-route-structured-data="true"]');
  await expect(script).toHaveCount(1);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect.poll(async () => JSON.parse(await script.textContent() || "null"))
    .toEqual(buildRouteStructuredData(schemaContext(path)));
  await expect(page.locator('script[data-artcovr-static-structured-data="true"]')).toHaveCount(0);
}

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
  await assertRouteSchema(page, path);
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

  await page.locator('a[href="/about"]:visible').first().click();
  await expect(page).toHaveURL(/\/about$/);
  await assertUsablePage(page);
  await assertRouteHead(page, "/about");

  await page.locator('a[href="/archive"]:visible').first().click();
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

  await page.locator('a[href="/archive"]:visible').first().click();
  await expect(page).toHaveURL(/\/archive$/);
  await assertUsablePage(page);
  await assertRouteHead(page, "/archive");

  expect(documentNavigations).toBe(1);
});

test("a delayed schema import cannot overwrite a newer navigation", async ({ page }) => {
  let releaseImport!: () => void;
  const importGate = new Promise<void>((resolve) => { releaseImport = resolve; });
  let importRequested = false;
  await page.route("**/src/lib/artcovr/route-structured-data.ts*", async (route) => {
    importRequested = true;
    await importGate;
    await route.continue();
  });
  await page.goto("/cover-art", { waitUntil: "domcontentloaded" });
  await assertUsablePage(page);
  await expect.poll(() => importRequested).toBe(true);
  await page.locator('a[href="/about"]:visible').first().click();
  await expect(page).toHaveURL(/\/about$/);
  await assertUsablePage(page);
  releaseImport();
  await assertRouteSchema(page, "/about");
});

const genrePath = `/cover-art/${getArtworkGenres(displayArtworks[0])[0]}`;
const schemaRoutes = [
  "/", "/cover-art", genrePath,
  ...ANSWER_GUIDE_BY_PATH.keys(),
  "/faq", "/archive", `/product/${displayArtworks[0].slug}`,
];

for (const path of schemaRoutes) {
  test(`adopts initial static JSON-LD without losing route context: ${path}`, async ({ page }) => {
    // The development server emits metadata but not the production JSON-LD.
    // Seed its document with the real static renderer output to exercise adoption.
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "document") return route.continue();
      const response = await route.fetch();
      const html = await response.text();
      const staticScript = renderStaticRoute(schemaContext(path)).structuredDataHtml
        .replace("<script ", '<script id="static-schema-fixture" ');
      await route.fulfill({
        response,
        body: html.replace(
          /<script[^>]*data-artcovr-static-structured-data="true"[^>]*>[\s\S]*?<\/script>/,
          staticScript,
        ),
      });
    });
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await assertUsablePage(page);
    await assertRouteSchema(page, path);
    await expect(page.locator("#static-schema-fixture")).toHaveAttribute(
      "data-artcovr-route-structured-data", "true",
    );
  });
}

test("replaces schema across genre, guide and fallback navigation, including history", async ({ page }) => {
  let documentNavigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.resourceType() === "document") documentNavigations += 1;
  });
  await page.goto("/cover-art", { waitUntil: "domcontentloaded" });
  await assertUsablePage(page);
  await assertRouteSchema(page, "/cover-art");

  for (const path of [
    genrePath, `/product/${displayArtworks[0].slug}`, "/archive",
    ...ANSWER_GUIDE_BY_PATH.keys(), "/faq", "/about", "/",
  ]) {
    await page.locator(`a[href="${path}"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await assertUsablePage(page);
    await assertRouteSchema(page, path);
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/about$/);
  await assertRouteSchema(page, "/about");
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await assertRouteSchema(page, "/");
  expect(documentNavigations).toBe(1);
});
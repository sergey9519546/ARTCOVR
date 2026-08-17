import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };

// The Playwright suite runs with NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING=1 (see
// playwright.config.ts), so the app renders curated-review.json — 100 works
// that carry no tier and therefore all default to the "featured" tier. Assert
// against that catalog, which is what this build actually surfaces, rather than
// curated-public (139), which only the production build uses.
type ReviewRow = { slug: string; tier?: "featured" | "archive" };
const catalog = curatedReview as ReviewRow[];
const featuredCount = catalog.length;
const archiveCount = catalog.length;
const SPIRAL_CAP = 40;

// Staging review images are not shipped in public/ (the 139 production images
// live there; review-only works reference assets in private storage). Only
// enforce the zero-broken-images guard when the active catalog's images are
// all present in public/ (i.e. production mode).
const publicRoot = path.join(process.cwd(), "public");
const stagingHasMissingImages = catalog.some(
  (row) => !fs.existsSync(path.join(publicRoot, row.image.replace(/^\//, ""))),
);

test("the home surfaces expose the complete featured tier without broken images", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");

  const grid = page.locator('section[aria-labelledby="selected-artworks"]');
  await expect(grid.locator('a[data-artwork="true"]')).toHaveCount(featuredCount);

  const carousel = page.locator('section[aria-label="The ARTCOVR archive"]');
  await expect(carousel.locator('a[data-artwork="true"]')).toHaveCount(featuredCount);

  const spiral = page.locator(
    'section[aria-label="ARTCOVR archive sequence"], section[aria-label="ARTCOVR spiral archive"]',
  );
  const expectedSpiralCount = test.info().project.name.startsWith("mobile")
    ? featuredCount
    : Math.min(featuredCount, SPIRAL_CAP);
  await expect(spiral.locator('a[data-artwork="true"]')).toHaveCount(expectedSpiralCount);

  const result = await page.evaluate(async () => {
    const selectors = [
      'section[aria-labelledby="selected-artworks"] a[data-artwork="true"]',
      'section[aria-label="The ARTCOVR archive"] a[data-artwork="true"]',
      'section[aria-label="ARTCOVR archive sequence"] a[data-artwork="true"], section[aria-label="ARTCOVR spiral archive"] a[data-artwork="true"]',
    ];
    const links = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLAnchorElement>(selector)));
    const images = links.flatMap((link) => Array.from(link.querySelectorAll<HTMLImageElement>("img")));
    await Promise.all(
      images.map(async (image) => {
        image.loading = "eager";
        if (image.complete) return;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 8000);
          image.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
          image.addEventListener("error", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }),
    );
    return {
      uniqueDestinations: new Set(links.map((link) => link.pathname)).size,
      invalidDestinations: links.filter((link) => !link.pathname.startsWith("/product/")).length,
      brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(result.uniqueDestinations).toBe(featuredCount);
  expect(result.invalidDestinations).toBe(0);
  if (!stagingHasMissingImages) {
    expect(result.brokenImages).toBe(0);
  }
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("the archive lists every published tier and each product destination renders", async ({ request }) => {
  const archive = await request.get("/archive");
  expect(archive.status()).toBe(200);
  const html = await archive.text();
  const destinations = Array.from(html.matchAll(/href="(\/product\/[^"]+)"/g), (match) => match[1]);
  const uniqueDestinations = [...new Set(destinations)];
  expect(uniqueDestinations).toHaveLength(archiveCount);

  const responses = await Promise.all(uniqueDestinations.map((destination) => request.get(destination)));
  expect(responses.filter((response) => response.status() !== 200)).toHaveLength(0);
});
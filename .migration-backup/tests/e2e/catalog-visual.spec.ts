import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import curatedPublic from "../../src/lib/artcovr/curated-public.json" with { type: "json" };
import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };

type AppMode = "public" | "staging";
const configuredMode = process.env.PLAYWRIGHT_ARTCOVR_MODE;
if (configuredMode !== "public" && configuredMode !== "staging") {
  throw new Error(
    "PLAYWRIGHT_ARTCOVR_MODE must explicitly identify the public or staging catalog.",
  );
}
const appMode: AppMode = configuredMode;

// Catalog expectations come from the same explicit mode label passed to the
// Playwright process. If the owned Next server starts with the wrong projection,
// the exact home/archive counts below fail rather than silently certifying it.
type ReviewRow = {
  slug: string;
  image: string;
  tier?: "featured" | "archive" | "delete";
};
const catalog = (appMode === "public" ? curatedPublic : curatedReview) as ReviewRow[];
const featuredCount = catalog.filter(
  (row) => (row.tier ?? "featured") === "featured",
).length;
const archiveCount = catalog.length;
const SPIRAL_CAP = 40;

// Review-only works can reference private-storage assets that intentionally do
// not ship in public/. Every approved public projection image must be present.
const publicRoot = path.join(process.cwd(), "public");
const catalogHasMissingImages = catalog.some(
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
  if (appMode === "public" || !catalogHasMissingImages) {
    expect(result.brokenImages).toBe(0);
  }
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("the archive lists every active-mode catalog row and each product destination renders", async ({ request }) => {
  // On a freshly started dev server every route needs JIT compilation, so the
  // serial probe of the entire active catalog can take well over 30 s. Raise the
  // per-test budget without weakening any assertion.
  test.setTimeout(90_000);
  const archive = await request.get("/archive");
  expect(archive.status()).toBe(200);
  const html = await archive.text();
  const destinations = Array.from(html.matchAll(/href="(\/product\/[^"]+)"/g), (match) => match[1]);
  const uniqueDestinations = [...new Set(destinations)];
  expect(uniqueDestinations).toHaveLength(archiveCount);

  const failedDestinations: string[] = [];
  // Avoid asking the dev compiler to materialize the entire dynamic catalog at
  // once. That thundering herd can race Next's incremental JSON cache and emit
  // spurious `Unexpected end of JSON input` responses unrelated to a route.
  for (const destination of uniqueDestinations) {
    let response = await request.get(destination);
    if (response.status() >= 500) {
      // A cold Next dev route can lose an incremental-cache read while the
      // compiler is materializing its first JSON payload. Confirm the route
      // itself, not that transient dev-server race.
      response = await request.get(destination);
    }
    if (response.status() !== 200) failedDestinations.push(destination);
  }
  expect(failedDestinations).toEqual([]);
});

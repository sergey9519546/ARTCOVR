import { expect, test } from "@playwright/test";

test("the supplied gallery surfaces expose the complete 100-cover catalog without broken images", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");

  const grid = page.locator('section[aria-labelledby="selected-artworks"]');
  await expect(grid.locator('a[data-artwork="true"]')).toHaveCount(100);

  const carousel = page.locator('section[aria-label="The ARTCOVR archive"]');
  await expect(carousel.locator('a[data-artwork="true"]')).toHaveCount(100);

  const spiral = page.locator(
    'section[aria-label="ARTCOVR archive sequence"], section[aria-label="ARTCOVR spiral archive"]',
  );
  const expectedSpiralCount = test.info().project.name.startsWith("mobile") ? 100 : 40;
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

  expect(result.uniqueDestinations).toBe(100);
  expect(result.invalidDestinations).toBe(0);
  expect(result.brokenImages).toBe(0);
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("all 100 product destinations render the exact selected artwork", async ({ request }) => {
  const archive = await request.get("/archive");
  expect(archive.status()).toBe(200);
  const html = await archive.text();
  const destinations = Array.from(html.matchAll(/href="(\/product\/[^"]+)"/g), (match) => match[1]);
  const uniqueDestinations = [...new Set(destinations)];
  expect(uniqueDestinations).toHaveLength(100);

  const responses = await Promise.all(uniqueDestinations.map((destination) => request.get(destination)));
  expect(responses.filter((response) => response.status() !== 200)).toHaveLength(0);
});

import { expect, test } from "@playwright/test";
import { featuredArtworks } from "../../src/lib/artcovr/artworks";
import { makeJourneyConsts } from "../../src/components/parity/journey";

for (const width of [1069, 1440]) {
  test(`archive starts at the left edge and keeps the spiral handoff aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/archive", { waitUntil: "domcontentloaded" });
    const journey = page.getByRole("region", { name: "ARTCOVR archive journey", exact: true });
    await expect(journey).toBeVisible();
    await expect(page.locator('.pin-spacer > section[aria-label="ARTCOVR archive journey"]')).toHaveCount(1);
    const first = page.getByRole("region", { name: "The ARTCOVR archive", exact: true }).locator(".carousel-card").first();
    await expect.poll(async () => {
      const section = await journey.boundingBox();
      const card = await first.boundingBox();
      return section && card ? Math.abs(card.x - section.x) : 1000;
    }).toBeLessThan(1);

    const sectionStart = await journey.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
    const constants = makeJourneyConsts(featuredArtworks.length);
    await page.evaluate((top) => {
      const lenis = (window as Window & { __lenis?: { scrollTo: (value: number, options: { immediate: boolean }) => void } }).__lenis;
      if (lenis) lenis.scrollTo(top, { immediate: true });
      else window.scrollTo(0, top);
    }, sectionStart + constants.carouselSpan + 1);
    const lead = page.getByRole("region", { name: "ARTCOVR spiral archive", exact: true }).locator('[data-shared-lead="true"]');
    await expect(lead).toBeVisible();
    await expect.poll(async () => {
      const section = await journey.boundingBox();
      const card = await lead.boundingBox();
      return section && card ? Math.abs(card.x - section.x) : 1000;
    }).toBeLessThan(3);
  });
}

test("reduced-motion archive starts flush left with keyboard-operable cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  const section = page.getByRole("region", { name: "The ARTCOVR archive", exact: true });
  const cards = section.locator(".carousel-card");
  await expect.poll(async () => {
    const sectionBox = await section.boundingBox();
    const firstBox = await cards.first().boundingBox();
    return sectionBox && firstBox ? Math.abs(firstBox.x - sectionBox.x) : 1000;
  }).toBeLessThan(1);
  await section.focus();
  await section.press("ArrowRight");
  await expect.poll(async () => {
    const sectionBox = await section.boundingBox();
    const nextBox = await cards.nth(1).boundingBox();
    return sectionBox && nextBox ? Math.abs(nextBox.x - sectionBox.x) : 1000;
  }).toBeLessThan(1);
});

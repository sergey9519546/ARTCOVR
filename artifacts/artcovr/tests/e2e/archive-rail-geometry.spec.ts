import { expect, test } from "@playwright/test";
import { homepageArtworkGroups } from "../../src/lib/artcovr/homepage-artwork-groups";
import { makeJourneyConsts } from "../../src/components/parity/journey";

for (const width of [1069, 1440]) {
  test(`archive starts at the left edge and keeps the spiral handoff aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/archive", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event("scroll"));
    });
    const journey = page.getByRole("region", { name: "ARTCOVR archive journey", exact: true });
    await expect(journey).toBeVisible();
    await expect(page.locator('.pin-spacer > section[aria-label="ARTCOVR archive journey"]')).toHaveCount(1);
    const pinSpacer = page.locator(".pin-spacer").filter({ has: journey });
    const first = page.getByRole("region", { name: "The ARTCOVR archive", exact: true }).locator(".carousel-card").first();
    await expect.poll(async () => {
      const section = await journey.boundingBox();
      const card = await first.boundingBox();
      return section && card ? Math.abs(card.x - section.x) : 1000;
    }).toBeLessThan(1);
    let stableSectionStart: number | undefined;
    let previousSectionStart: number | undefined;
    await expect.poll(async () => {
      const currentSectionStart = await pinSpacer.evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      );
      const stable =
        previousSectionStart !== undefined &&
        Math.abs(currentSectionStart - previousSectionStart) < 0.5;
      previousSectionStart = currentSectionStart;
      if (stable) stableSectionStart = currentSectionStart;
      return stable;
    }).toBe(true);
    const sectionStart = stableSectionStart!;
    const constants = makeJourneyConsts(homepageArtworkGroups.slide.length);
    await page.evaluate((top) => {
      for (let offset = 0; offset <= 1000; offset += 1) {
        window.scrollTo(0, top + offset);
        window.dispatchEvent(new Event("scroll"));
        const lead = document.querySelector<HTMLElement>('[data-shared-lead="true"]');
        if (lead?.style.visibility === "visible") break;
      }
    }, sectionStart + constants.carouselSpan + 1);
    await page.waitForTimeout(100);
    const lead = page.getByRole("region", { name: "ARTCOVR spiral archive", exact: true }).locator('[data-shared-lead="true"]');
    await expect(lead).toBeVisible();
    await expect(lead).toHaveAttribute(
      "data-artwork-id",
      homepageArtworkGroups.spiral[0].id,
    );
    await expect(lead).toHaveAttribute(
      "href",
      `/product/${homepageArtworkGroups.spiral[0].slug}`,
    );
    expect(homepageArtworkGroups.spiral[0].id).not.toBe(
      homepageArtworkGroups.slide.at(-1)?.id,
    );
    await expect(lead).toHaveAttribute("tabindex", "0");
    await expect.poll(async () => {
      const section = await journey.boundingBox();
      const card = await lead.boundingBox();
      return section && card ? Math.abs(card.x - section.x) : 1000;
    }).toBeLessThan(3);
  });
}

test("the visible carousel cover links to its own product page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/archive", { waitUntil: "domcontentloaded" });

  const artwork = homepageArtworkGroups.slide[0];
  const card = page.getByTestId(`carousel-artwork-${artwork.id}`);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", `/product/${artwork.slug}`);
  await card.click();
  await expect(page).toHaveURL(`/product/${artwork.slug}`);
});

test("the spiral handoff cover opens its own product page by keyboard", async ({ page }) => {
  const width = 1440;
  await page.setViewportSize({ width, height: 960 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/archive", { waitUntil: "domcontentloaded" });

  const journey = page.getByRole("region", {
    name: "ARTCOVR archive journey",
    exact: true,
  });
  await expect(journey).toBeVisible();
  const pinSpacer = page.locator(".pin-spacer").filter({ has: journey });
  const sectionStart = await pinSpacer.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  const constants = makeJourneyConsts(homepageArtworkGroups.slide.length);
  await page.evaluate(
    ({ top, spiralLeadId }) => {
      for (let offset = 0; offset <= 1000; offset += 1) {
        window.scrollTo(0, top + offset);
        window.dispatchEvent(new Event("scroll"));
        const lead = document.querySelector<HTMLElement>(
          `[data-testid="spiral-artwork-${spiralLeadId}"]`,
        );
        if (lead?.style.visibility === "visible" && lead.tabIndex === 0) break;
      }
    },
    {
      top: sectionStart + constants.carouselSpan + 1,
      spiralLeadId: homepageArtworkGroups.spiral[0].id,
    },
  );

  const artwork = homepageArtworkGroups.spiral[0];
  const lead = page.getByTestId(`spiral-artwork-${artwork.id}`);
  await expect(lead).toBeVisible();
  await expect(lead).toHaveAttribute("tabindex", "0");
  await lead.focus();
  await lead.press("Enter");
  await expect(page).toHaveURL(`/product/${artwork.slug}`);
});

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

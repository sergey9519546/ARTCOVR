import { expect, test, type Page } from "@playwright/test";

import { makeJourneyConsts } from "../../src/components/parity/journey";
import { featuredArtworks } from "../../src/lib/artcovr/artworks";
import { homepageArtworkGroups } from "../../src/lib/artcovr/homepage-artwork-groups";

async function openStaticHomepage(page: Page) {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 8_000,
  });
}

async function openAnimatedHomepage(page: Page) {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 10_000,
  });

  const journey = page.getByRole("region", {
    name: "ARTCOVR archive journey",
    exact: true,
  });
  await expect(journey).toBeVisible();
  const pinSpacer = page.locator(".pin-spacer").filter({ has: journey });
  await expect(pinSpacer).toHaveCount(1);
  const sectionStart = await pinSpacer.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );

  return { journey, sectionStart };
}

test("homepage displays every featured cover once across its three surfaces", async ({
  page,
}) => {
  await openStaticHomepage(page);

  const grid = page.getByTestId("homepage-artwork-grid");
  const carousel = page.getByRole("region", {
    name: "The ARTCOVR archive",
    exact: true,
  });
  const spiral = page.getByRole("region", {
    name: "ARTCOVR archive sequence",
    exact: true,
  });
  const groupLocators = [
    grid.locator('a[data-artwork="true"]'),
    carousel.locator('a[data-artwork="true"]'),
    spiral.locator('a[data-artwork="true"]'),
  ];
  const expectedGroups = [
    homepageArtworkGroups.grid,
    homepageArtworkGroups.slide,
    homepageArtworkGroups.spiral,
  ];

  for (let index = 0; index < groupLocators.length; index += 1) {
    await expect(groupLocators[index]).toHaveCount(expectedGroups[index].length);
    const artworkIds = await groupLocators[index].evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).dataset.artworkId ?? ""),
    );
    expect([...artworkIds].sort()).toEqual(
      expectedGroups[index].map(({ id }) => id).sort(),
    );
  }

  const allIds = (
    await Promise.all(
      groupLocators.map((group) =>
        group.evaluateAll((links) =>
          links.map((link) => (link as HTMLAnchorElement).dataset.artworkId ?? ""),
        ),
      ),
    )
  ).flat();
  expect(new Set(allIds).size).toBe(featuredArtworks.length);
  expect([...allIds].sort()).toEqual(
    featuredArtworks.map(({ id }) => id).sort(),
  );

  const carouselCards = carousel.locator(".carousel-card");
  await expect(carouselCards.first()).toHaveAttribute("tabindex", "0");
  await expect(carouselCards.nth(10)).toHaveAttribute("tabindex", "-1");

  const runwayCards = grid.locator("[data-artwork-runway] a[data-artwork='true']");
  await expect(runwayCards.first()).toHaveAttribute("tabindex", "0");
  await expect(runwayCards.last()).toHaveAttribute("tabindex", "-1");
});

test("small-screen homepage keeps off-screen cover links out of keyboard order", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 8_000,
  });

  const grid = page.getByTestId("homepage-artwork-grid");
  const carousel = page.getByRole("region", {
    name: "The ARTCOVR archive",
    exact: true,
  });
  const runwayCards = grid.locator("[data-artwork-runway] a[data-artwork='true']");
  const carouselCards = carousel.locator(".carousel-card");

  await expect(
    grid.locator('a[data-artwork="true"]'),
  ).toHaveCount(homepageArtworkGroups.grid.length);
  await expect(carouselCards).toHaveCount(homepageArtworkGroups.slide.length);
  await expect(runwayCards.first()).toHaveAttribute("tabindex", "0");
  await expect(runwayCards.last()).toHaveAttribute("tabindex", "-1");
  await expect(carouselCards.first()).toHaveAttribute("tabindex", "0");
  await expect(carouselCards.nth(2)).toHaveAttribute("tabindex", "-1");
});

test("static carousel artwork opens its own product page", async ({ page }) => {
  await openStaticHomepage(page);
  const artwork = homepageArtworkGroups.slide[0];
  const card = page.getByTestId(`carousel-artwork-${artwork.id}`);

  await card.click();
  await expect(page).toHaveURL(`/product/${artwork.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    artwork.title,
  );
});

test("static spiral artwork opens its own product page", async ({ page }) => {
  await openStaticHomepage(page);
  const artwork = homepageArtworkGroups.spiral[0];
  const card = page.getByTestId(`spiral-artwork-${artwork.id}`);

  await card.click();
  await expect(page).toHaveURL(`/product/${artwork.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    artwork.title,
  );
});

test("a visible animated carousel cover navigates by mouse", async ({ page }) => {
  const { sectionStart } = await openAnimatedHomepage(page);
  await page.evaluate((top) => {
    window.scrollTo(0, top);
    window.dispatchEvent(new Event("scroll"));
  }, sectionStart);

  const artwork = homepageArtworkGroups.slide[0];
  const card = page.getByTestId(`carousel-artwork-${artwork.id}`);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("tabindex", "0");
  await card.click();
  await expect(page).toHaveURL(`/product/${artwork.slug}`, { timeout: 10_000 });
});

test("the visible animated spiral lead navigates by keyboard", async ({ page }) => {
  const { sectionStart } = await openAnimatedHomepage(page);
  const constants = makeJourneyConsts(homepageArtworkGroups.slide.length);
  const artwork = homepageArtworkGroups.spiral[0];

  await page.evaluate(
    ({ top, carouselSpan, spiralLeadId }) => {
      for (let offset = 0; offset <= 1000; offset += 1) {
        window.scrollTo(0, top + carouselSpan + offset);
        window.dispatchEvent(new Event("scroll"));
        const lead = document.querySelector<HTMLElement>(
          `[data-testid="spiral-artwork-${spiralLeadId}"]`,
        );
        if (lead?.style.visibility === "visible" && lead.tabIndex === 0) break;
      }
    },
    {
      top: sectionStart,
      carouselSpan: constants.carouselSpan,
      spiralLeadId: artwork.id,
    },
  );

  const lead = page.getByTestId(`spiral-artwork-${artwork.id}`);
  await expect(lead).toBeVisible();
  await expect(lead).toHaveAttribute("tabindex", "0");
  await lead.focus();
  await lead.press("Enter");
  await expect(page).toHaveURL(`/product/${artwork.slug}`, { timeout: 10_000 });
});

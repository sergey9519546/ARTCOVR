import { expect, test, type Locator, type Page } from "@playwright/test";
import { displayArtworks } from "../../src/lib/artcovr/artworks";
import { getArtworkColors } from "../../src/lib/artcovr/catalog-intelligence";
import { hybridSearch } from "../../src/lib/artcovr/semantic-search";

const FEATURED_TOTAL = 92;
const ARCHIVE_TOTAL = 187;

type FacetKey = "genre" | "mood" | "color";

function catalogStatus(page: Page) {
  return page.locator('[data-catalog-controls] [role="status"]');
}

function resultCount(statusText: string) {
  const match = statusText.match(/^(\d+) \/ \d+ works$/);
  if (!match) throw new Error(`Unexpected catalog status: ${statusText}`);
  return Number(match[1]);
}

function facet(page: Page, key: FacetKey) {
  return page.locator(`[data-facet="${key}"]`);
}

function choices(facetLocator: Locator) {
  return facetLocator.locator('button[aria-label^="Color:"]');
}

async function chooseFirstFacetOption(page: Page, key: FacetKey) {
  if (key !== "color") {
    const select = facet(page, key).getByRole("combobox");
    await expect(select).toBeVisible();
    await select.click();
    const option = page.getByRole("option").nth(1);
    const label = (await option.innerText()).trim().replace(/\s+·\s+\d+$/, "");
    await option.click();
    const count = resultCount(await catalogStatus(page).innerText());
    expect(count, `${key} filter should match at least one work`).toBeGreaterThan(0);
    return { choice: select, label, value: label };
  }
  const choice = choices(facet(page, key)).first();
  await expect(choice).toBeVisible();
  const label =
    (await choice.getAttribute("aria-label")) || (await choice.innerText());
  await choice.click();
  const count = resultCount(await catalogStatus(page).innerText());
  expect(count, `${key} filter should match at least one work`).toBeGreaterThan(
    0,
  );
  return { choice, label: label.trim(), value: label.trim() };
}

async function clearFacet(page: Page, key: FacetKey) {
  if (key !== "color") {
    const select = facet(page, key).getByRole("combobox");
    await select.click();
    await page.getByRole("option").first().click();
    return;
  }
  await facet(page, key)
    .getByRole("button", { name: "All", exact: true })
    .click();
}

async function findCompatibleOption(page: Page, key: FacetKey) {
  if (key !== "color") {
    const select = facet(page, key).getByRole("combobox");
    await select.click();
    const optionCount = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    for (let index = 1; index < optionCount; index += 1) {
      await select.click();
      await page.getByRole("option").nth(index).click();
      const count = resultCount(await catalogStatus(page).innerText());
      if (count > 0) return { choice: select, count };
      await clearFacet(page, key);
    }
    throw new Error(`No compatible ${key} option was available`);
  }
  const options = choices(facet(page, key));
  const optionCount = await options.count();

  for (let index = 0; index < optionCount; index += 1) {
    const choice = options.nth(index);
    await choice.click();
    const count = resultCount(await catalogStatus(page).innerText());
    if (count > 0) {
      return { choice, count };
    }
    await clearFacet(page, key);
  }

  throw new Error(`No compatible ${key} option was visible`);
}

test("public catalog keeps genre coverage and featured/archive boundaries", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('section[aria-labelledby="selected-artworks"] a[data-artwork="true"]'),
  ).toHaveCount(FEATURED_TOTAL);
  await expect(page.locator("[data-catalog-controls]")).toHaveCount(0);
  await expect(page.locator('[aria-label="ARTCOVR archive journey"]')).toHaveCount(1);

  await page.goto("/archive");
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );

  const cards = page.locator('section[aria-label="Artwork archive"] article');
  await expect(cards).toHaveCount(ARCHIVE_TOTAL);

  const genreLines = await cards.evaluateAll((artworkCards) =>
    artworkCards.map((card) => {
      const paragraphs = [...card.querySelectorAll("p")];
      return paragraphs.at(-1)?.textContent?.trim() || "";
    }),
  );
  expect(genreLines).toHaveLength(ARCHIVE_TOTAL);
  expect(genreLines.every((genreLine) => genreLine.length > 0)).toBe(true);
});

test("archive genre, mood and color filters work independently and together", async ({
  page,
}) => {
  await page.goto("/archive");
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );
  await expect(page.getByRole("combobox", { name: "Music genre", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Mood", exact: true })).toBeVisible();

  for (const key of ["genre", "mood", "color"] as const) {
    await chooseFirstFacetOption(page, key);
    await clearFacet(page, key);
    await expect(catalogStatus(page)).toHaveText(
      `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
    );
  }

  await chooseFirstFacetOption(page, "genre");
  await findCompatibleOption(page, "mood");
  const colorMatch = await findCompatibleOption(page, "color");

  expect(colorMatch.count).toBeGreaterThan(0);
  await expect(catalogStatus(page)).toHaveText(
    new RegExp(`^[1-9]\\d* / ${ARCHIVE_TOTAL} works$`),
  );
});

test("searching a displayed genre finds the filtered artwork", async ({
  page,
}) => {
  await page.goto("/archive");

  const { label: displayedGenre } = await chooseFirstFacetOption(page, "genre");
  const filteredCards = page.locator(
    'section[aria-label="Artwork archive"] article',
  );
  await expect.poll(async () => filteredCards.count()).toBeGreaterThan(0);
  const expectedHref = await filteredCards
    .first()
    .locator("a")
    .getAttribute("href");
  expect(expectedHref).toBeTruthy();

  await clearFacet(page, "genre");
  await page.locator("#archive-search").fill(displayedGenre);
  await expect.poll(async () => filteredCards.count()).toBeGreaterThan(0);
  await expect(
    page.locator(
      `section[aria-label="Artwork archive"] a[href="${expectedHref}"]`,
    ),
  ).toHaveCount(1);
});

test("empty archive results explain how to recover", async ({ page }) => {
  await page.goto("/archive");
  await page.locator("#archive-search").fill("no-match-for-this-catalog");

  const empty = page.getByRole("region", { name: "No matching artwork" });
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("No works match those filters.");
  await expect(empty.getByRole("button", { name: "Clear filters" })).toBeVisible();

  await empty.getByRole("button", { name: "Clear filters" }).click();
  await expect(catalogStatus(page)).toHaveText(`${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`);
  await expect(page.locator("#archive-search")).toBeFocused();
});

test("archive keeps search relevance through color filtering and restores curation on clear", async ({ page }) => {
  const ranked = hybridSearch("blue", displayArtworks);
  const rankedSlugs = ranked.map(({ slug }) => slug);
  const curatedMatches = displayArtworks.filter(({ slug }) => rankedSlugs.includes(slug));
  expect(rankedSlugs).not.toEqual(curatedMatches.map(({ slug }) => slug));

  await page.goto("/archive");
  const input = page.locator("#archive-search");
  const cardLinks = page.locator('section[aria-label="Artwork archive"] article a');
  const paths = () => cardLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  await input.fill("blue");
  await expect.poll(paths).toEqual(ranked.map(({ slug }) => `/product/${slug}`));

  await facet(page, "color").getByRole("button", { name: "Color: Blue", exact: true }).click();
  const blueMatches = ranked.filter((artwork) => getArtworkColors(artwork).includes("Blue"));
  expect(blueMatches.length).toBeGreaterThan(0);
  await expect.poll(paths).toEqual(blueMatches.map(({ slug }) => `/product/${slug}`));

  await clearFacet(page, "color");
  await page.getByRole("button", { name: "Clear archive search", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect.poll(paths).toEqual(displayArtworks.map(({ slug }) => `/product/${slug}`));
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBeNull();
});

test("archive search and facets restore from the URL", async ({ page }) => {
  await page.goto("/archive");
  const { label: selectedGenre } = await chooseFirstFacetOption(page, "genre");
  await expect.poll(() => new URL(page.url()).searchParams.get("genre")).toBeTruthy();
  const filteredCount = resultCount(await catalogStatus(page).innerText());

  await page.reload();
  await expect(page.locator("#archive-search")).toHaveValue("");
  await expect(catalogStatus(page)).toHaveText(`${filteredCount} / ${ARCHIVE_TOTAL} works`);
  await expect(facet(page, "genre").getByRole("combobox")).toContainText(selectedGenre);
  await expect(page.url()).toContain("genre=");
});

test("every catalog color remains visible and keyboard focusable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/archive");
  const colorChoices = choices(facet(page, "color"));
  const expectedColors = new Set(displayArtworks.flatMap(getArtworkColors));
  await expect(colorChoices).toHaveCount(expectedColors.size);
  for (const choice of await colorChoices.all()) {
    await expect(choice).toBeVisible();
    await choice.focus();
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute("aria-label", /^Color: .+/);
  }
});

test("homepage journey survives repeated reloads and route transitions", async ({
  page,
}) => {
  test.setTimeout(60_000);

  const journeyErrors: string[] = [];
  const recordJourneyError = (message: string) => {
    if (/removeChild|Invalid hook call/i.test(message)) {
      journeyErrors.push(message);
    }
  };

  page.on("console", (message) => recordJourneyError(message.text()));
  page.on("pageerror", (error) => recordJourneyError(error.message));

  for (let cycle = 0; cycle < 2; cycle += 1) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(
      page.locator('[aria-label="ARTCOVR archive journey"]'),
    ).toHaveCount(1);
    await expect(page.locator(".pin-spacer")).toHaveCount(1);

    await page.locator("#hero-link").click();
    await expect(page).toHaveURL(/\/archive$/);
    await expect(
      page.locator('[aria-label="ARTCOVR archive journey"]'),
    ).toHaveCount(1);
    await expect(page.locator(".pin-spacer")).toHaveCount(1);

    await page.locator('a[aria-label="ARTCOVR home"]').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(page.locator(".pin-spacer")).toHaveCount(1);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 8_000,
  });
  await expect(page.locator(".pin-spacer")).toHaveCount(1);
  expect(journeyErrors).toEqual([]);
});

test("archive journey recovers after browser back and forward navigation", async ({
  page,
}) => {
  const journeyErrors: string[] = [];
  const recordJourneyError = (message: string) => {
    if (/removeChild|Invalid hook call/i.test(message)) {
      journeyErrors.push(message);
    }
  };

  page.on("console", (message) => recordJourneyError(message.text()));
  page.on("pageerror", (error) => recordJourneyError(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 8_000,
  });
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  await page.locator("#hero-link").click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  await page.goForward();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  expect(journeyErrors).toEqual([]);
});

test("archive journey recovers after viewing an artwork", async ({ page }) => {
  const journeyErrors: string[] = [];
  const recordJourneyError = (message: string) => {
    if (/removeChild|Invalid hook call/i.test(message)) {
      journeyErrors.push(message);
    }
  };

  page.on("console", (message) => recordJourneyError(message.text()));
  page.on("pageerror", (error) => recordJourneyError(error.message));

  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  const artworkLink = page
    .locator('section[aria-label="Artwork archive"] article a')
    .first();
  await expect(artworkLink).toHaveAttribute("href", /\/product\/.+/);
  await artworkLink.click();
  await expect(page).toHaveURL(/\/product\/[^/]+$/);
  await expect(page.locator("main h1")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Archive", exact: true })
    .click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(
    page.locator('[aria-label="ARTCOVR archive journey"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pin-spacer")).toHaveCount(1);

  expect(journeyErrors).toEqual([]);
});

test("curation workspace redirects signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/catalog-intelligence");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fcatalog-intelligence/);
});

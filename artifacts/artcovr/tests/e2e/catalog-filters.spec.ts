import { expect, test, type Locator, type Page } from "@playwright/test";

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
  return facetLocator.getByRole("button").filter({ hasNotText: "All" });
}

async function chooseFirstFacetOption(page: Page, key: FacetKey) {
  const choice = choices(facet(page, key)).first();
  await expect(choice).toBeVisible();
  const label =
    (await choice.getAttribute("aria-label")) || (await choice.innerText());
  await choice.click();
  const count = resultCount(await catalogStatus(page).innerText());
  expect(count, `${key} filter should match at least one work`).toBeGreaterThan(
    0,
  );
  return { choice, label: label.trim() };
}

async function clearFacet(page: Page, key: FacetKey) {
  await facet(page, key)
    .getByRole("button", { name: "All", exact: true })
    .click();
}

async function findCompatibleOption(page: Page, key: FacetKey) {
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
  await expect(catalogStatus(page)).toHaveText(
    `${FEATURED_TOTAL} / ${FEATURED_TOTAL} works`,
  );

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

test("genre, mood, and color filters work independently and together", async ({
  page,
}) => {
  await page.goto("/archive");
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );

  for (const key of ["genre", "mood", "color"] as const) {
    await chooseFirstFacetOption(page, key);
    await clearFacet(page, key);
    await expect(catalogStatus(page)).toHaveText(
      `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
    );
  }

  await chooseFirstFacetOption(page, "genre");
  const moodMatch = await findCompatibleOption(page, "mood");
  const colorMatch = await findCompatibleOption(page, "color");

  expect(moodMatch.count).toBeGreaterThan(0);
  expect(colorMatch.count).toBeGreaterThan(0);
  await expect(catalogStatus(page)).toHaveText(
    new RegExp(`^[1-9]\\d* / ${ARCHIVE_TOTAL} works$`),
  );
});

test("searching a displayed genre finds the filtered artwork", async ({
  page,
}) => {
  await page.goto("/archive");

  const genreChoice = choices(facet(page, "genre")).first();
  await expect(genreChoice).toBeVisible();
  const displayedGenre = (await genreChoice.innerText()).trim();

  await genreChoice.click();
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

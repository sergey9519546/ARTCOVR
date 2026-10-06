import { expect, test, type Locator, type Page } from "@playwright/test";
import { displayArtworks } from "../../src/lib/artcovr/artworks";
import { getArtworkColors } from "../../src/lib/artcovr/catalog-intelligence";
import { homepageArtworkGroups } from "../../src/lib/artcovr/homepage-artwork-groups";
import { hybridSearch } from "../../src/lib/artcovr/semantic-search";

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
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
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
      await page.keyboard.press("Home");
      for (let step = 0; step < index; step += 1) {
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Enter");
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

test("archive keeps the full catalog while separating featured covers as a curated sequence", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
    timeout: 8_000,
  });
  await expect(
    page.locator('section[aria-labelledby="selected-artworks"] a[data-artwork="true"]'),
  ).toHaveCount(homepageArtworkGroups.grid.length);
  await expect(page.locator("[data-catalog-controls]")).toHaveCount(0);
  await expect(page.locator('[aria-label="ARTCOVR archive journey"]')).toHaveCount(1);
  await expect(
    page.locator('[aria-label="The ARTCOVR archive"] a[data-artwork="true"]'),
  ).toHaveCount(homepageArtworkGroups.slide.length);
  await expect(
    page.locator('[aria-label="ARTCOVR spiral archive"] a[data-artwork="true"]'),
  ).toHaveCount(homepageArtworkGroups.spiral.length);

  await page.goto("/archive");
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );

  const cards = page.locator('section[aria-label="Artwork archive"] article');
  await expect(cards).toHaveCount(ARCHIVE_TOTAL);
  const archivePaths = await cards
    .locator('a[href^="/product/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  expect(new Set(archivePaths).size).toBe(ARCHIVE_TOTAL);
  expect(new Set(archivePaths)).toEqual(
    new Set(displayArtworks.map(({ slug }) => `/product/${slug}`)),
  );

  const genreLines = await cards.evaluateAll((artworkCards) =>
    artworkCards.map((card) => {
      const paragraphs = [...card.querySelectorAll("p")];
      return paragraphs.at(-1)?.textContent?.trim() || "";
    }),
  );
  expect(genreLines).toHaveLength(ARCHIVE_TOTAL);
  expect(genreLines.every((genreLine) => genreLine.length > 0)).toBe(true);

  const editorialSequence = page.getByRole("region", {
    name: "Selected covers, in sequence.",
  });
  await expect(editorialSequence).toBeVisible();
  await expect(editorialSequence).toContainText(
    "The covers in this sequence are selected from the full catalog above; the full archive remains searchable and filterable there.",
  );
  const curatedPaths = await editorialSequence
    .locator('a[href^="/product/"]')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).filter(Boolean),
    );
  expect(curatedPaths.length).toBeGreaterThan(0);
  expect(curatedPaths.every((path) => archivePaths.includes(path))).toBe(true);
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

type PaletteTheme = "light" | "dark";

async function preparePaletteScreenshot(
  page: Page,
  theme: PaletteTheme = "light",
) {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("theme", selectedTheme);
  }, theme);
  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );
  await expect(page.locator("[data-catalog-controls]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

type OpenMenuViewport = "phone" | "tablet" | "desktop";

async function verifyOpenFacetMenu(
  page: Page,
  key: Exclude<FacetKey, "color">,
  theme: PaletteTheme,
  viewport: OpenMenuViewport,
) {
  const trigger = facet(page, key).getByRole("combobox");
  await trigger.focus();
  await page.keyboard.press("Enter");

  let menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");

  const selectedOption = menu.locator('[role="option"][data-highlighted]');
  await expect(selectedOption).toBeVisible();
  await expect(selectedOption.locator(".discovery-palette-option-count")).toBeVisible();
  const selectedLabel = (await selectedOption.innerText())
    .trim()
    .replace(/\s+·\s+\d+\s+works$/, "");

  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toContainText(selectedLabel);
  await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBeTruthy();
  expect(resultCount(await catalogStatus(page).innerText())).toBeGreaterThan(0);

  await trigger.focus();
  await page.keyboard.press("Enter");
  menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");

  const selected = menu.locator('[role="option"][data-state="checked"]');
  const highlighted = menu.locator('[role="option"][data-highlighted]');
  await expect(selected).toHaveCount(1);
  await expect(highlighted).toHaveCount(1);
  await expect(selected).toBeVisible();
  await expect(highlighted).toBeVisible();
  await expect(selected).not.toHaveAttribute("data-highlighted", "");
  await expect(selected.locator(".discovery-palette-option-count")).toBeVisible();
  await expect(highlighted.locator(".discovery-palette-option-count")).toBeVisible();

  const layout = await menu.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const selectedOption = element.querySelector<HTMLElement>(
      '[role="option"][data-state="checked"]',
    );
    const highlightedOption = element.querySelector<HTMLElement>(
      '[role="option"][data-highlighted]',
    );
    if (!selectedOption || !highlightedOption) {
      throw new Error("The open archive menu is missing its selected or highlighted option");
    }

    const countFits = (option: HTMLElement) => {
      const count = option.querySelector<HTMLElement>(".discovery-palette-option-count");
      if (!count) return false;
      const optionBounds = option.getBoundingClientRect();
      const countBounds = count.getBoundingClientRect();
      return (
        countBounds.width > 0 &&
        countBounds.height > 0 &&
        countBounds.left >= optionBounds.left - 1 &&
        countBounds.right <= optionBounds.right + 1 &&
        countBounds.left >= 0 &&
        countBounds.right <= window.innerWidth &&
        countBounds.top >= 0 &&
        countBounds.bottom <= window.innerHeight
      );
    };
    const optionFits = (option: HTMLElement) => {
      const optionBounds = option.getBoundingClientRect();
      return (
        optionBounds.width > 0 &&
        optionBounds.height > 0 &&
        optionBounds.left >= bounds.left - 1 &&
        optionBounds.right <= bounds.right + 1 &&
        optionBounds.top >= bounds.top - 1 &&
        optionBounds.bottom <= bounds.bottom + 1 &&
        optionBounds.left >= 0 &&
        optionBounds.right <= window.innerWidth &&
        optionBounds.top >= 0 &&
        optionBounds.bottom <= window.innerHeight
      );
    };
    return {
      menuFitsViewport:
        bounds.width > 0 &&
        bounds.height > 0 &&
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        bounds.top >= 0 &&
        bounds.bottom <= window.innerHeight,
      selectedOptionFits: optionFits(selectedOption),
      highlightedOptionFits: optionFits(highlightedOption),
      selectedCountFits: countFits(selectedOption),
      highlightedCountFits: countFits(highlightedOption),
      selectedTextColor: getComputedStyle(selectedOption).color,
      highlightedTextColor: getComputedStyle(highlightedOption).color,
      selectedCountColor: getComputedStyle(
        selectedOption.querySelector(".discovery-palette-option-count")!,
      ).color,
      highlightedCountColor: getComputedStyle(
        highlightedOption.querySelector(".discovery-palette-option-count")!,
      ).color,
      highlightedBackground: getComputedStyle(highlightedOption).backgroundColor,
    };
  });

  expect(layout.menuFitsViewport).toBe(true);
  expect(layout.selectedOptionFits).toBe(true);
  expect(layout.highlightedOptionFits).toBe(true);
  expect(layout.selectedCountFits).toBe(true);
  expect(layout.highlightedCountFits).toBe(true);
  for (const color of [
    layout.selectedTextColor,
    layout.highlightedTextColor,
    layout.selectedCountColor,
    layout.highlightedCountColor,
    layout.highlightedBackground,
  ]) {
    expect(color).not.toBe("rgba(0, 0, 0, 0)");
  }

  await expect(menu).toHaveScreenshot(
    `archive-filter-menu-${theme}-${viewport}-${key}-open.png`,
    { animations: "disabled", caret: "hide", scale: "css" },
  );

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
}

async function snapshotPaletteStates(
  page: Page,
  viewport: "desktop" | "tablet" | "tablet-wide" | "mobile",
  theme: PaletteTheme = "light",
) {
  const controls = page.locator("[data-catalog-controls]");
  const screenshotPrefix =
    theme === "dark" ? `archive-palette-dark-${viewport}` : `archive-palette-${viewport}`;
  const screenshotOptions = {
    animations: "disabled" as const,
    caret: "hide" as const,
    scale: "css" as const,
  };

  if (viewport === "tablet" || viewport === "tablet-wide") {
    const tabletLayout = await controls.evaluate((root) => {
      const palette = root.querySelector<HTMLElement>(".discovery-palette-swatches");
      const secondary = root.querySelector<HTMLElement>(".discovery-palette-select-grid");
      const cards = [...root.querySelectorAll<HTMLElement>(".discovery-palette-select-card")];
      if (!palette || !secondary || cards.length !== 2) {
        throw new Error("Archive palette tablet layout is missing expected regions");
      }

      const controlsRect = root.getBoundingClientRect();
      const paletteRect = palette.getBoundingClientRect();
      const secondaryRect = secondary.getBoundingClientRect();
      const cardRects = cards.map((card) => card.getBoundingClientRect());
      const withinControls = [paletteRect, secondaryRect, ...cardRects].every(
        (rect) =>
          rect.left >= controlsRect.left - 1 &&
          rect.right <= controlsRect.right + 1,
      );

      return {
        paletteColumns: getComputedStyle(palette).gridTemplateColumns.trim().split(/\s+/).length,
        secondaryColumns: getComputedStyle(secondary).gridTemplateColumns.trim().split(/\s+/).length,
        paletteFits: palette.scrollWidth <= palette.clientWidth + 1,
        secondaryFits: secondary.scrollWidth <= secondary.clientWidth + 1,
        cardsShareRow: Math.abs(cardRects[0].top - cardRects[1].top) < 1,
        withinControls,
      };
    });
    expect(tabletLayout).toEqual({
      paletteColumns: 13,
      secondaryColumns: 2,
      paletteFits: true,
      secondaryFits: true,
      cardsShareRow: true,
      withinControls: true,
    });
  }

  await expect(controls).toHaveScreenshot(
    `${screenshotPrefix}-default.png`,
    screenshotOptions,
  );

  await facet(page, "color")
    .getByRole("button", { name: "Color: Blue", exact: true })
    .click();
  await expect(catalogStatus(page)).toHaveText(/\d+ \/ 187 works/);
  await expect(
    facet(page, "color").getByRole("button", { name: "Color: Blue", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  if (viewport === "tablet" || viewport === "tablet-wide") {
    await expect(controls.getByRole("button", { name: "Clear all filters", exact: true })).toBeVisible();
    await expect(controls.getByRole("button", { name: "Clear color", exact: true })).toBeVisible();
  }
  await expect(controls).toHaveScreenshot(
    `${screenshotPrefix}-one-color-active.png`,
    screenshotOptions,
  );

  await page.getByRole("button", { name: "Clear all filters", exact: true }).click();
  await expect(catalogStatus(page)).toHaveText(
    `${ARCHIVE_TOTAL} / ${ARCHIVE_TOTAL} works`,
  );
  await expect(
    facet(page, "color").getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  if (viewport === "tablet" || viewport === "tablet-wide") {
    await expect(controls.getByRole("button", { name: "Clear all filters", exact: true })).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "Clear color", exact: true })).toHaveCount(0);
  }
  await expect(controls).toHaveScreenshot(
    `${screenshotPrefix}-cleared.png`,
    screenshotOptions,
  );
}

test.describe("archive palette visual states", () => {
  test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 1000 } });

    test("keeps default, active, and cleared controls stable", async ({ page }) => {
      await preparePaletteScreenshot(page);
      await snapshotPaletteStates(page, "desktop");
    });
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("keeps default, active, and cleared controls stable", async ({ page }) => {
      await preparePaletteScreenshot(page);
      await snapshotPaletteStates(page, "mobile");
    });
  });

  test.describe("tablet", () => {
    test.use({ viewport: { width: 768, height: 1000 } });

    test("keeps default, active, and cleared controls stable", async ({ page }) => {
      await preparePaletteScreenshot(page);
      await snapshotPaletteStates(page, "tablet");
    });
  });

  test.describe("upper tablet", () => {
    test.use({ viewport: { width: 1024, height: 1000 } });

    test("keeps default, active, and cleared controls stable", async ({ page }) => {
      await preparePaletteScreenshot(page);
      await snapshotPaletteStates(page, "tablet-wide");
    });
  });

  test.describe("dark theme", () => {
    test.use({ colorScheme: "dark" });

    test.describe("desktop", () => {
      test.use({ viewport: { width: 1440, height: 1000 } });

      test("keeps default, active, and cleared controls stable", async ({ page }) => {
        await preparePaletteScreenshot(page, "dark");
        await snapshotPaletteStates(page, "desktop", "dark");
      });
    });

    test.describe("mobile", () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test("keeps default, active, and cleared controls stable", async ({ page }) => {
        await preparePaletteScreenshot(page, "dark");
        await snapshotPaletteStates(page, "mobile", "dark");
      });
    });

    test.describe("tablet", () => {
      test.use({ viewport: { width: 768, height: 1000 } });

      test("keeps default, active, and cleared controls stable", async ({ page }) => {
        await preparePaletteScreenshot(page, "dark");
        await snapshotPaletteStates(page, "tablet", "dark");
      });
    });

    test.describe("upper tablet", () => {
      test.use({ viewport: { width: 1024, height: 1000 } });

      test("keeps default, active, and cleared controls stable", async ({ page }) => {
        await preparePaletteScreenshot(page, "dark");
        await snapshotPaletteStates(page, "tablet-wide", "dark");
      });
    });
  });
});

test.describe("open archive filter menus", () => {
  const viewports = [
    { name: "phone" as const, size: { width: 390, height: 844 } },
    { name: "tablet" as const, size: { width: 768, height: 1000 } },
    { name: "desktop" as const, size: { width: 1440, height: 1000 } },
  ];

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
      test.describe(`${theme} theme, ${viewport.name}`, () => {
        test.use({
          colorScheme: theme,
          viewport: viewport.size,
        });

        test("keeps genre and mood menus readable and keyboard operable", async ({
          page,
        }) => {
          await preparePaletteScreenshot(page, theme);
          await verifyOpenFacetMenu(page, "genre", theme, viewport.name);
          await verifyOpenFacetMenu(page, "mood", theme, viewport.name);
        });
      });
    }
  }
});

test.describe("archive palette tablet text zoom", () => {
  test.use({ viewport: { width: 768, height: 1000 } });

  test("keeps labels, selectors, active state, and clear actions keyboard reachable", async ({
    page,
  }) => {
    await preparePaletteScreenshot(page);
    await page.addStyleTag({
      content: `
        [data-catalog-controls] .discovery-palette-index-label,
        [data-catalog-controls] .discovery-palette-select-label,
        [data-catalog-controls] .discovery-palette-meta { font-size: 12.5px !important; }
        [data-catalog-controls] .discovery-palette-clear-inline,
        [data-catalog-controls] .discovery-palette-footer button,
        [data-catalog-controls] .discovery-palette-all { font-size: 13.75px !important; }
        [data-catalog-controls] .discovery-palette-selected { font-size: 11.25px !important; }
        [data-catalog-controls] .discovery-palette-select-trigger { font-size: 17.5px !important; }
        [data-catalog-controls] .discovery-palette-select-content [role="option"] { font-size: 16.25px !important; }
        [data-catalog-controls] .discovery-palette-footer p { font-size: 16.25px !important; }
      `,
    });

    const controls = page.locator("[data-catalog-controls]");
    const assertContained = async () => {
      const layout = await controls.evaluate((root) => {
        const rootRect = root.getBoundingClientRect();
        const required = [
          ...root.querySelectorAll<HTMLElement>(
            ".discovery-palette-index-label, .discovery-palette-swatch, " +
              ".discovery-palette-select-label, .discovery-palette-select-card, " +
              ".discovery-palette-select-trigger, .discovery-palette-meta, " +
              ".discovery-palette-footer",
          ),
        ];
        return {
          overflowX: root.scrollWidth - root.clientWidth,
          required: required.map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              visible: rect.width > 0 && rect.height > 0,
              contained:
                rect.left >= rootRect.left - 1 &&
                rect.right <= rootRect.right + 1,
            };
          }),
        };
      });

      expect(layout.overflowX).toBeLessThanOrEqual(1);
      expect(layout.required.every(({ visible, contained }) => visible && contained)).toBe(
        true,
      );
    };

    await expect(controls.locator(".discovery-palette-index-label")).toHaveText(
      "01 / primary index",
    );
    await expect(controls.locator(".discovery-palette-select-label")).toHaveCount(2);
    await expect(controls.locator(".discovery-palette-select-trigger")).toHaveCount(2);
    await expect(controls.locator(".discovery-palette-swatch")).toHaveCount(13);
    await assertContained();

    const allColors = controls.getByRole("button", { name: "All", exact: true });
    const colorChoices = choices(facet(page, "color"));
    for (const button of [allColors, ...(await colorChoices.all())]) {
      await button.focus();
      await expect(button).toBeFocused();
    }

    for (const label of ["Music genre", "Mood"]) {
      const trigger = controls.getByRole("combobox", { name: label, exact: true });
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("option").first()).toBeVisible();
      await page.keyboard.press("Escape");
    }

    const blue = facet(page, "color").getByRole("button", {
      name: "Color: Blue",
      exact: true,
    });
    await blue.focus();
    await page.keyboard.press("Enter");
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    await expect(
      controls.getByRole("button", { name: "Clear color", exact: true }),
    ).toBeVisible();
    await expect(
      controls.getByRole("button", { name: "Clear all filters", exact: true }),
    ).toBeVisible();
    await assertContained();

    const clearColor = controls.getByRole("button", {
      name: "Clear color",
      exact: true,
    });
    await clearColor.focus();
    await expect(clearColor).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(allColors).toHaveAttribute("aria-pressed", "true");
    await expect(
      controls.getByRole("button", { name: "Clear color", exact: true }),
    ).toHaveCount(0);

    await blue.focus();
    await page.keyboard.press("Enter");
    const clearAll = controls.getByRole("button", {
      name: "Clear all filters",
      exact: true,
    });
    await clearAll.focus();
    await expect(clearAll).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(allColors).toHaveAttribute("aria-pressed", "true");
    await expect(
      controls.getByRole("button", { name: "Clear all filters", exact: true }),
    ).toHaveCount(0);
    await assertContained();
  });
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

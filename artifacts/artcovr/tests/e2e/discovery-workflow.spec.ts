import { expect, test, type Page } from "@playwright/test";
import { displayArtworks } from "../../src/lib/artcovr/artworks";
import { MUSIC_GENRES } from "../../src/lib/artcovr/genre-index";
import { rankGenreArtwork, rankSimilarArtwork } from "../../src/lib/artcovr/discovery-index";
import { orderDiscoveryArtwork } from "../../src/lib/artcovr/discovery-state";
import { hybridSearch } from "../../src/lib/artcovr/semantic-search";

function cards(page: Page) {
  return page.locator('section[aria-label="Artwork archive"] article');
}

function resultPaths(page: Page) {
  return cards(page).locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
}

function paths(items: readonly { slug: string }[]) {
  return items.map(({ slug }) => `/product/${slug}`);
}

test("a visitor saves a crate, reloads it, and removes a cover without creating a reservation", async ({ page }) => {
  const selected = displayArtworks.slice(0, 2);
  await page.goto("/archive");
  for (const artwork of selected) {
    await page.getByRole("button", { name: `Save ${artwork.title} to crate`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Remove ${artwork.title} from crate`, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  const crate = page.getByRole("button", { name: "My crate 2", exact: true });
  await crate.click();
  await expect(crate).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => resultPaths(page)).toEqual(paths(selected));
  await expect(page.getByText(/Your shortlist on this browser/)).toContainText("not a reservation or a purchase");
  await page.reload();
  await expect(page.getByRole("button", { name: "My crate 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => resultPaths(page)).toEqual(paths(selected));
  await page.getByRole("button", { name: `Remove ${selected[0].title} from crate`, exact: true }).click();
  await expect.poll(() => resultPaths(page)).toEqual(paths(selected.slice(1)));
  await expect(page.getByRole("button", { name: "My crate 1", exact: true })).toBeVisible();
});

test("following artwork uses real connections, excludes the seed, and survives browser history", async ({ page }) => {
  const seed = displayArtworks.find((artwork) => ["visual", "palette", "mood"].every((mode) => rankSimilarArtwork(artwork, displayArtworks, mode as "visual" | "palette" | "mood").length > 0));
  expect(seed).toBeTruthy();
  await page.goto("/archive");
  await page.getByRole("button", { name: `Find similar to ${seed!.title}`, exact: true }).click();
  await expect(page.getByRole("region", { name: "Visual starting point", exact: true })).toContainText(seed!.title);
  await expect.poll(() => new URL(page.url()).searchParams.get("similar")).toBe(seed!.slug);
  await expect.poll(() => resultPaths(page)).toEqual(paths(rankSimilarArtwork(seed!, displayArtworks).map(({ artwork }) => artwork)));
  await expect(cards(page).locator(`a[href="/product/${seed!.slug}"]`)).toHaveCount(0);
  for (const [mode, name] of [["palette", "Shared palette"], ["mood", "Shared mood"]] as const) {
    const control = page.getByRole("button", { name, exact: true });
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => resultPaths(page)).toEqual(paths(rankSimilarArtwork(seed!, displayArtworks, mode).map(({ artwork }) => artwork)));
  }
  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get("similar")).toBeNull();
  await expect(cards(page)).toHaveCount(displayArtworks.length);
  await page.goForward();
  await expect(page.getByRole("button", { name: "Shared mood", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => resultPaths(page)).toEqual(paths(rankSimilarArtwork(seed!, displayArtworks, "mood").map(({ artwork }) => artwork)));
});

test("search keeps spaces while typing and restores the exact query after reload", async ({ page }) => {
  await page.goto("/archive");
  const input = page.getByRole("searchbox", { name: "Find your visual direction", exact: true });
  const query = "blue moon ";
  await input.pressSequentially(query);
  await expect(input).toHaveValue(query);
  await expect.poll(() => new URL(page.url()).searchParams.get("query")).toBe(query);
  await expect.poll(() => resultPaths(page)).toEqual(paths(hybridSearch(query, displayArtworks)));
  await page.reload();
  await expect(input).toHaveValue(query);
  await expect.poll(() => resultPaths(page)).toEqual(paths(hybridSearch(query, displayArtworks)));
});

test("an unknown starting artwork yields an honest empty state with no padded recommendations", async ({ page }) => {
  await page.goto("/archive?similar=not-a-public-artwork&mode=palette");
  await expect(page.getByText("That starting artwork is not in the public archive. Clear the direction to explore available works.", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  const empty = page.getByRole("region", { name: "No matching artwork", exact: true });
  await empty.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(cards(page)).toHaveCount(displayArtworks.length);
  await expect.poll(() => new URL(page.url()).searchParams.get("similar")).toBeNull();
});

test("order and density persist through reload and restore curated order explicitly", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/archive");
  const grid = page.locator('section[aria-label="Artwork archive"] [data-density]');
  const columns = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  await expect.poll(columns).toBe(4);
  const order = page.getByRole("group", { name: "Artwork order", exact: true });
  const nextOrder = order.getByRole("button", { name: "Next artwork order", exact: true });
  const previousOrder = order.getByRole("button", { name: "Previous artwork order", exact: true });
  await nextOrder.click();
  await nextOrder.click();
  await page.getByRole("group", { name: "Artwork density", exact: true }).getByRole("button", { name: "Compact", exact: true }).click();
  await expect.poll(columns).toBe(6);
  await expect.poll(() => resultPaths(page)).toEqual(paths(orderDiscoveryArtwork(displayArtworks, "title")));
  await expect.poll(() => new URL(page.url()).searchParams.get("density")).toBe("compact");
  await page.reload();
  await expect(order).toHaveValue("title");
  await expect(page.getByRole("group", { name: "Artwork density", exact: true }).getByRole("button", { name: "Compact", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toHaveAttribute("data-density", "compact");
  await expect.poll(columns).toBe(6);
  await expect.poll(() => resultPaths(page)).toEqual(paths(orderDiscoveryArtwork(displayArtworks, "title")));
  await expect(order.getByRole("button", { name: "Current artwork order", exact: true })).toHaveText("Title A–Z");
  await previousOrder.click();
  await expect.poll(() => resultPaths(page)).toEqual(paths(orderDiscoveryArtwork(displayArtworks, "diverse")));
  await previousOrder.click();
  await expect.poll(() => resultPaths(page)).toEqual(paths(displayArtworks));
});

test("music genres expose metadata evidence and add only supported visual neighbors on request", async ({ page }) => {
  const genre = MUSIC_GENRES.find((value) => rankGenreArtwork(value, displayArtworks).some(({ basis }) => basis === "visual-neighbor"));
  expect(genre).toBeTruthy();
  const ranked = rankGenreArtwork(genre!, displayArtworks);
  const direct = ranked.filter(({ basis }) => basis === "metadata");
  const connected = ranked.filter(({ basis }) => basis === "visual-neighbor");
  expect(direct.length).toBeGreaterThan(0);
  expect(connected.length).toBeGreaterThan(0);
  await page.goto("/archive");
  const select = page.getByRole("combobox", { name: "Music genre", exact: true });
  await expect(select).toBeVisible();
  await expect(select.locator('option:not([value=""])')).toHaveCount(MUSIC_GENRES.length);
  const available = await select.locator('option:not([value=""])').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(new Set(available)).toEqual(new Set(MUSIC_GENRES));
  await select.selectOption(genre!);
  await expect.poll(() => resultPaths(page)).toEqual(paths(direct.map(({ artwork }) => artwork)));
  const firstDirect = cards(page).filter({ has: page.getByRole("link", { name: `View ${direct[0].artwork.title}`, exact: true }) });
  await expect(firstDirect).toContainText(direct[0].reasons[0]);
  const connections = page.getByRole("checkbox", { name: "Include visual connections", exact: true });
  await expect(connections).not.toBeChecked();
  await connections.check();
  await expect.poll(() => resultPaths(page)).toEqual(paths(ranked.map(({ artwork }) => artwork)));
  const firstConnected = cards(page).filter({ has: page.getByRole("link", { name: `View ${connected[0].artwork.title}`, exact: true }) });
  await expect(firstConnected).toContainText(connected[0].reasons[0]);
  await page.reload();
  await expect(connections).toBeChecked();
  await expect(select).toHaveValue(genre!);
  await expect.poll(() => resultPaths(page)).toEqual(paths(ranked.map(({ artwork }) => artwork)));
  await connections.uncheck();
  await expect.poll(() => resultPaths(page)).toEqual(paths(direct.map(({ artwork }) => artwork)));
});

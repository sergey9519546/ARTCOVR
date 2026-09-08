import { expect, test } from "@playwright/test";
import { displayArtworks, getArtworkGenres } from "../../src/lib/artcovr/artworks";
import { rankSimilarArtwork } from "../../src/lib/artcovr/discovery-index";

const seed = displayArtworks.find((artwork) => {
  const count = rankSimilarArtwork(artwork, displayArtworks, "palette").length;
  return count > 24 && count < 48;
})!;

test("product discovery shows actual image, palette and mood connections with reasons", async ({ page }) => {
  expect(seed, "catalog should exercise a partial final page of palette matches").toBeTruthy();
  await page.goto(`/product/${seed.slug}`);
  const region = page.getByRole("region", { name: "Find similar", exact: true });
  const links = region.locator('a[href^="/product/"]');
  const paths = () => links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));

  for (const [mode, label] of [["visual", "Image connections"], ["palette", "Shared palette"], ["mood", "Shared mood"]] as const) {
    await region.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    const expected = rankSimilarArtwork(seed, displayArtworks, mode);
    await expect.poll(paths).toEqual(expected.slice(0, 24).map(({ artwork }) => `/product/${artwork.slug}`));
    await expect(region.locator("[data-discovery-reason]")).toHaveCount(Math.min(expected.length, 24));
    await expect(region.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveAttribute("aria-pressed", "true");
    await expect(region.getByRole("status")).toContainText(`Showing ${Math.min(expected.length, 24)} of ${expected.length}`);
    await expect(region.getByRole("link", { name: /Explore this visual trail/ })).toHaveAttribute("href", `/archive?similar=${seed.slug}${mode === "visual" ? "" : `&mode=${mode}`}`);
  }

  const genre = getArtworkGenres(seed)[0];
  const genreLink = page.locator(`main > header a[href="/archive?genre=${genre}"]`);
  await expect(genreLink).toBeVisible();
  await expect(page.getByText("Genre lanes suggest a visual fit from artwork metadata, not audio classification.")).toBeVisible();
  await genreLink.click();
  await expect.poll(() => new URL(page.url()).searchParams.get("genre")).toBe(genre);
});

test("related discovery loads the true remainder and resets after SPA product navigation", async ({ page }) => {
  await page.goto(`/product/${seed.slug}`);
  const region = page.getByRole("region", { name: "Find similar", exact: true });
  const palette = rankSimilarArtwork(seed, displayArtworks, "palette");
  const remaining = palette.length - 24;
  await region.getByRole("button", { name: /^Shared palette/ }).click();
  const load = region.getByRole("button", { name: /^Load / });
  await expect(load).toHaveText(`Load ${remaining} more · ${remaining} remaining`);
  await load.focus();
  await load.press("Enter");
  await expect(region.locator('a[href^="/product/"]')).toHaveCount(palette.length);
  await expect(load).toHaveCount(0);
  await expect(region.getByRole("link", { name: `Open ${palette[24].artwork.title}`, exact: true })).toBeFocused();

  const next = palette[0].artwork;
  await region.getByRole("link", { name: `Open ${next.title}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/product/${next.slug}$`));
  await expect(region.getByRole("button", { name: /^Image connections/ })).toHaveAttribute("aria-pressed", "true");
  await expect(region.locator('a[href^="/product/"]')).toHaveCount(rankSimilarArtwork(next, displayArtworks).length);
  await expect(region.getByRole("link", { name: /Explore this visual trail/ })).toHaveAttribute("href", `/archive?similar=${next.slug}`);
  await region.getByRole("button", { name: /^Shared palette/ }).click();
  await expect(region.locator('a[href^="/product/"]')).toHaveCount(Math.min(rankSimilarArtwork(next, displayArtworks, "palette").length, 24));
});

test("loading another related batch continues keyboard focus at its first new work", async ({ page }) => {
  const longSeed = displayArtworks.find((artwork) => rankSimilarArtwork(artwork, displayArtworks, "palette").length > 48);
  expect(longSeed, "catalog should exercise more than two related batches").toBeTruthy();
  const palette = rankSimilarArtwork(longSeed!, displayArtworks, "palette");
  await page.goto(`/product/${longSeed!.slug}`);
  const region = page.getByRole("region", { name: "Find similar", exact: true });
  await region.getByRole("button", { name: /^Shared palette/ }).click();
  const load = region.getByRole("button", { name: /^Load / });
  await load.focus();
  await load.press("Enter");
  await expect(region.locator("a[data-related-artwork]")).toHaveCount(48);
  await expect(load).toBeVisible();
  await expect(region.getByRole("link", { name: `Open ${palette[24].artwork.title}`, exact: true })).toBeFocused();
});

for (const [mode, label] of [["palette", "Shared palette"], ["mood", "Shared mood"]] as const) {
  test(`opening a ${mode} trail preserves its selected mode in the archive`, async ({ page }) => {
    await page.goto(`/product/${seed.slug}`);
    const region = page.getByRole("region", { name: "Find similar", exact: true });
    await region.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    await region.getByRole("link", { name: /Explore this visual trail/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("similar")).toBe(seed.slug);
    await expect.poll(() => new URL(page.url()).searchParams.get("mode")).toBe(mode);
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    const archivePaths = () => page.locator('section[aria-label="Artwork archive"] article a').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    await expect.poll(archivePaths).toEqual(rankSimilarArtwork(seed, displayArtworks, mode).map(({ artwork }) => `/product/${artwork.slug}`));
  });
}

test.describe("mobile reduced-motion discovery", () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });

  test("connection controls remain visible and keyboard operable", async ({ page }) => {
    await page.goto(`/product/${seed.slug}`);
    const region = page.getByRole("region", { name: "Find similar", exact: true });
    const mood = region.getByRole("button", { name: /^Shared mood/ });
    await mood.scrollIntoViewIfNeeded();
    await expect(mood).toBeVisible();
    await mood.focus();
    await mood.press("Enter");
    await expect(mood).toBeFocused();
    await expect(mood).toHaveAttribute("aria-pressed", "true");
    const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(width.content).toBeLessThanOrEqual(width.viewport);
  });
});

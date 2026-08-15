import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("archive color and theme tokens remain compiled from the supplied UI contract", async () => {
  const css = await source("src/app/globals.css");

  assert.match(css, /@custom-variant dark/);
  for (const token of ["--color-cream", "--color-background", "--color-foreground"]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /\.artcovr-button/);
});

test("primary actions never make currentColor both their background and foreground", async () => {
  const paths = [
    "src/app/sign-in/page.tsx",
    "src/app/contact/page.tsx",
    "src/app/my-images/page.tsx",
    "src/app/product/[slug]/page.tsx",
    "src/components/artcovr/CheckoutReview.tsx",
    "src/components/artcovr/PromptStudio.tsx",
    "src/components/artcovr/PurchasedGenerationStudio.tsx",
    "src/components/parity/Footer.tsx",
  ];
  const combined = (await Promise.all(paths.map(source))).join("\n");

  assert.doesNotMatch(combined, /bg-current[^\n"]*text-\[#f3eee6\]/);
  assert.doesNotMatch(combined, /bg-current[^\n"]*text-background/);
  assert.match(combined, /artcovr-button/);
});

test("home remains usable for partial catalogs and non-scripted rendering", async () => {
  const [home, grid, spiral, snap, css] = await Promise.all([
    source("src/app/page.tsx"),
    source("src/components/parity/ProductGrid.tsx"),
    source("src/components/parity/SpiralScroll.tsx"),
    source("src/components/parity/FullScreenSnap.tsx"),
    source("src/app/globals.css"),
  ]);

  assert.match(home, /hydrated && \(!preloaderDone \|\| transitionActive\)/);
  assert.match(grid, /hasRange\(4, 7\)/);
  assert.match(spiral, /ITEMS\.length < 2/);
  assert.match(snap, /section\.artworkIndex % displayArtworks\.length/);
  assert.match(css, /@media \(scripting: none\)/);
});

test("mobile and hidden controls leave no invisible keyboard traps", async () => {
  const [menu, snap, cursor] = await Promise.all([
    source("src/components/parity/MobileMenu.tsx"),
    source("src/components/parity/FullScreenSnap.tsx"),
    source("src/components/parity/CustomCursor.tsx"),
  ]);

  assert.match(menu, /overflow-y-auto/);
  assert.match(menu, /main\.inert = true/);
  assert.match(snap, /inert={!inView \? true : undefined}/);
  assert.match(cursor, /if \(!rafId\) rafId = requestAnimationFrame\(tick\)/);
  assert.doesNotMatch(cursor, /rafId = requestAnimationFrame\(tick\);\s*};\s*rafId = requestAnimationFrame\(tick\)/);
});

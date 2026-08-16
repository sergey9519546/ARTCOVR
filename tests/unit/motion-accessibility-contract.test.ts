import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("intro bypasses instantly for reduced-motion but still plays on touch and narrow screens", async () => {
  const [preloader, transition, page] = await Promise.all([
    read("src/components/parity/Preloader.tsx"),
    read("src/components/parity/PageTransition.tsx"),
    read("src/app/page.tsx"),
  ]);
  // The intro (Preloader) must skip instantly for reduced-motion users and must
  // NOT bail on a coarse pointer or a narrow viewport — those still get the
  // experience and reach the static scroll journey through the home-page gate.
  assert.match(preloader, /\(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(preloader, /pointer: coarse/);
  assert.doesNotMatch(preloader, /max-width: 767px/);
  // The page-to-page transition still bypasses for reduced-motion, coarse
  // pointer, and narrow screens: it only ever activates on a fine-pointer
  // desktop, so the full gate stays inline for the contract scan.
  assert.match(transition, /prefers-reduced-motion: reduce\), \(pointer: coarse/);
  // The home page keeps main content blocked (inert) while the intro holds,
  // and decouples the intro bypass from the journey gate via REDUCED_MOTION_QUERY.
  assert.match(page, /inert=\{pageBlocked \? true : undefined\}/);
  assert.match(page, /REDUCED_MOTION_QUERY/);
});

test("carousel links to artwork and owns keyboard handling only while focused", async () => {
  const carousel = await read("src/components/parity/TiltedCarousel.tsx");
  assert.match(carousel, /href=\{`\/product\/\$\{item\.slug\}`\}/);
  assert.match(carousel, /section\.contains\(document\.activeElement\)/);
  assert.doesNotMatch(carousel, /window\.addEventListener\("keydown"/);
});

test("theme restores only a recognized saved preference", async () => {
  const theme = await read("src/hooks/artcovr/useTheme.ts");
  assert.match(theme, /localStorage\.getItem\("theme"\)/);
  assert.match(theme, /stored === "light" \|\| stored === "dark"/);
});

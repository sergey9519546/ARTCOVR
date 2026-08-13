import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("blocking motion exits immediately for reduced-motion and coarse-pointer users", async () => {
  const [preloader, transition, page] = await Promise.all([
    read("src/components/parity/Preloader.tsx"),
    read("src/components/parity/PageTransition.tsx"),
    read("src/app/page.tsx"),
  ]);
  assert.match(preloader, /prefers-reduced-motion: reduce\), \(pointer: coarse/);
  assert.match(transition, /prefers-reduced-motion: reduce\), \(pointer: coarse/);
  assert.match(page, /inert=\{pageBlocked \? true : undefined\}/);
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
  assert.match(theme, /stored === "light" \|\| stored === "dark" \|\| stored === "red"/);
});

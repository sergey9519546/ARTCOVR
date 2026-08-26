import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("all blocking motion shares the static eligibility contract", async () => {
  const [preloader, transition, page, motion] = await Promise.all([
    read("src/components/parity/Preloader.tsx"),
    read("src/components/parity/PageTransition.tsx"),
    read("src/app/page.tsx"),
    read("src/lib/artcovr/motion.ts"),
  ]);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /pointer: coarse/);
  assert.match(motion, /max-width: 767px/);
  assert.match(preloader, /STATIC_MEDIA_QUERY/);
  assert.match(preloader, /window\.addEventListener\("keydown", skipIntro\)/);
  assert.doesNotMatch(preloader, /keydown[^\n]*once: true/);
  assert.match(transition, /STATIC_MEDIA_QUERY/);
  assert.match(page, /STATIC_MEDIA_QUERY/);
  assert.match(page, /if \(!allowed\) \{\s*setPreloaderDone\(true\)/);
  assert.match(page, /inert=\{pageBlocked \? true : undefined\}/);
  assert.doesNotMatch(page, /REDUCED_MOTION_QUERY/);
});

test("hero entrance uses a scoped GSAP timeline and exact easing curve", async () => {
  const page = await read("src/app/page.tsx");
  assert.match(page, /gsap\.timeline/);
  assert.match(page, /CustomEase\.create\("artcovr-entrance", "0\.19,1,0\.22,1"\)/);
  assert.match(page, /gsap\.context/);
  assert.match(page, /context\.revert\(\)/);
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

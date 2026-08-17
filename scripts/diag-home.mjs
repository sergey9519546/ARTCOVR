import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleMsgs = [];
const pageErrors = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => pageErrors.push(`${e.message}\n${e.stack ?? ""}`));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// Wait past the preloader + failsafe (6s) and the Lenis/ScrollTrigger init.
await page.waitForTimeout(8000);

const state = await page.evaluate(() => {
  const root = document.documentElement;
  const pre = document.getElementById("artcovr-preloader");
  const header = document.getElementById("header");
  const track = document.querySelector(".carousel-card");
  const journey = document.querySelector('[aria-label="ARTCOVR archive journey"]');
  return {
    htmlClasses: root.className,
    loaded: root.classList.contains("loaded"),
    lenis: root.classList.contains("lenis"),
    preloaderPresent: !!pre,
    headerOpacity: header ? getComputedStyle(header).opacity : "n/a",
    mmCoarse: window.matchMedia("(pointer: coarse)").matches,
    mmReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    mmNarrow: window.matchMedia("(max-width: 767px)").matches,
    hasJourneySection: !!journey,
  };
});

console.log("=== STATE ===");
console.log(JSON.stringify(state, null, 2));
console.log("=== PAGE ERRORS (" + pageErrors.length + ") ===");
console.log(pageErrors.join("\n----\n"));
console.log("=== CONSOLE (" + consoleMsgs.length + ") ===");
console.log(consoleMsgs.slice(0, 60).join("\n"));

await browser.close();

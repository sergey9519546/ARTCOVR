import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(8000);

const before = await page.evaluate(() => {
  const t = document.querySelector(".carousel-card")?.parentElement;
  return t ? getComputedStyle(t).transform : "none";
});

// Drive scroll through Lenis via wheel events.
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(800);

const after = await page.evaluate(() => {
  const t = document.querySelector(".carousel-card")?.parentElement;
  const sec = document.querySelector('[aria-label="ARTCOVR archive journey"]');
  return {
    transform: t ? getComputedStyle(t).transform : "none",
    scrollY: window.scrollY,
    bodyH: document.body.scrollHeight,
  };
});

console.log("BEFORE:", before);
console.log("AFTER:", JSON.stringify(after, null, 2));
console.log("TRANSFORM CHANGED:", before !== after.transform);
console.log("PAGE ERRORS:", errs.length, errs.join("|"));
await browser.close();

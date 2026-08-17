import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(7000);
const nav = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll("#header nav a, #header nav button")).map((a) => a.textContent.trim());
  const k = document.getElementById("theme-switcher");
  return { headerItems: links, themeSwitcherVisible: k ? getComputedStyle(k).opacity : "n/a", preloader: !!document.getElementById("artcovr-preloader") };
});
console.log("HEADER:", JSON.stringify(nav));
console.log("ERRORS:", errs.length, errs.join("|"));
await browser.close();

import { expect, test } from "@playwright/test";

test("home and archive do not create horizontal page overflow", async ({ page }) => {
  for (const route of ["/", "/archive"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    if (route === "/") {
      await expect(page.locator("main")).not.toHaveAttribute("inert", "");
    }
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
});

test("primary CTA foreground and background meet text contrast", async ({ page }) => {
  await page.goto("/sign-in");
  const button = page.getByRole("button", { name: /send magic link/i });
  await expect(button).toBeVisible();

  const contrast = await button.evaluate((element) => {
    const parse = (color: string) =>
      (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const styles = getComputedStyle(element);
    const foreground = parse(styles.color);
    const background = parse(styles.backgroundColor);
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return (lighter + 0.05) / (darker + 0.05);
  });

  expect(contrast).toBeGreaterThanOrEqual(4.5);
});

test("mobile navigation opens, traps initial focus, and closes", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile interaction contract");
  await page.goto("/archive");
  await page.getByRole("button", { name: "Menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toHaveAttribute("inert", "");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        activeText: document.activeElement?.textContent?.trim() || "",
        activeTag: document.activeElement?.tagName || "",
      })),
    )
    .toEqual({ activeText: "Close", activeTag: "BUTTON" });
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("desktop theme controls have touch-size targets and change the rendered theme", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop theme controls");
  await page.goto("/");
  const darkTheme = page.getByRole("button", { name: "Switch to dark theme" });
  await expect(darkTheme).toBeVisible();
  const box = await darkTheme.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await darkTheme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("server-rendered home remains usable when JavaScript is disabled", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: /cover art/i })).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  await expect(page.locator('[role="status"][aria-label^="Loading"]')).toBeHidden();
  await context.close();
});

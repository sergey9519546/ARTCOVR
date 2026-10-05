import { expect, test, type Locator } from "@playwright/test";

/** WCAG sRGB relative luminance, including alpha compositing of CSS colors. */
async function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const rgba = (color: string) => {
      const values = color.match(/[\d.]+/g)!.map(Number);
      const scale = color.startsWith("color(srgb ") ? 255 : 1;
      return [values[0] * scale, values[1] * scale, values[2] * scale, values[3] ?? 1];
    };
    const over = (front: number[], back: number[]) => [
      ...front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])),
      1,
    ];
    const layers: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      layers.unshift(rgba(getComputedStyle(node).backgroundColor));
    }
    const background = layers.reduce((back, front) => over(front, back), [255, 255, 255, 1]);
    const foreground = over(rgba(getComputedStyle(element).color), background);
    const luminance = (color: number[]) => {
      const linear = color.slice(0, 3).map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const a = luminance(foreground);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await contrast(locator), await locator.innerText()).toBeGreaterThanOrEqual(4.5);
}

for (const theme of ["light", "dark"] as const) {
  test(`archive filter text meets minimum contrast in ${theme} theme`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/archive");
    // Radix temporarily aria-hides the page while its portaled listbox is open.
    const filters = page.locator('section[aria-label="Archive filters"]');
    await expect(filters).toBeVisible();
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    // Let the page's existing theme-color transition finish before measuring.
    await page.waitForTimeout(400);

    for (const label of await filters.locator(".discovery-palette-index-label, .discovery-palette-select-label > span, .discovery-palette-meta").all()) {
      await expectReadable(label);
    }

    const swatches = filters.getByRole("button", { name: /^Color:/ });
    expect(await swatches.count()).toBe(12);
    for (const swatch of await swatches.all()) {
      const originalColor = await swatch.evaluate((element) => getComputedStyle(element).backgroundColor);
      await swatch.click();
      await expect(swatch).toHaveAttribute("aria-pressed", "true");
      await expectReadable(swatch.locator(".discovery-palette-selected"));
      expect(await swatch.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(originalColor);
    }
    await expectReadable(filters.getByRole("button", { name: "Clear color", exact: true }));
    await expectReadable(filters.getByRole("button", { name: "Clear all filters", exact: true }));

    for (const key of ["genre", "mood"]) {
      const trigger = filters.locator(`[data-facet="${key}"] [role="combobox"]`);
      await trigger.click();
      await expectReadable(trigger);
      const checked = page.locator('[role="option"][data-state="checked"]');
      await page.keyboard.press("ArrowDown");
      await expectReadable(checked);
      await expectReadable(checked.locator(".discovery-palette-option-count"));
      // Checked text must also pass against the tinted highlight background.
      await page.keyboard.press("Home");
      await expect(checked).toHaveAttribute("data-highlighted", "");
      await expectReadable(checked);
      for (const count of await page.locator('[role="option"] .discovery-palette-option-count').all()) {
        if (await count.isVisible()) await expectReadable(count);
      }
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await trigger.click();
      await expectReadable(page.locator('[role="option"][data-state="checked"]'));
      await page.keyboard.press("Escape");
    }
    await filters.getByRole("button", { name: "Clear all filters", exact: true }).click();
    await expect(filters.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(filters.locator(".discovery-palette-selected")).toHaveCount(0);
  });
}

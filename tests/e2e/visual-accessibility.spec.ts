import { expect, test } from "@playwright/test";

async function renderedContrast(
  page: import("@playwright/test").Page,
  selector: string,
  property: "color" | "borderTopColor",
) {
  return page.locator(selector).evaluate((element, propertyName) => {
    const sample = (color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D context is unavailable");
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data] as [
        number,
        number,
        number,
        number,
      ];
    };
    const composite = (foreground: number[], background: number[], alpha: number) =>
      foreground.slice(0, 3).map(
        (channel, index) => channel * alpha + background[index] * (1 - alpha),
      );
    const luminance = (rgb: number[]) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };

    const styles = getComputedStyle(element);
    const foreground = sample(styles[propertyName]);
    const background = sample(getComputedStyle(document.body).backgroundColor);
    const propertyAlpha = foreground[3] / 255;
    const elementOpacity = propertyName === "color" ? Number(styles.opacity) : 1;
    const rendered = composite(
      foreground,
      background,
      propertyAlpha * elementOpacity,
    );
    const foregroundLuminance = luminance(rendered);
    const backgroundLuminance = luminance(background);
    return (
      (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
      (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    );
  }, property);
}

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

test("red theme keeps muted text and form boundaries distinguishable", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "red"));
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "red");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(138, 16, 35)",
  );

  const mutedContrast = await renderedContrast(
    page,
    "main > div:first-child > p:first-child",
    "color",
  );
  const inputBoundaryContrast = await renderedContrast(
    page,
    "#email",
    "borderTopColor",
  );

  expect(mutedContrast).toBeGreaterThanOrEqual(4.5);
  expect(inputBoundaryContrast).toBeGreaterThanOrEqual(3);
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
  for (const [name, href] of [
    ["Home", "/"],
    ["Archive", "/archive"],
    ["My Images", "/my-images"],
    ["About", "/about"],
    ["Sign in", "/sign-in"],
  ] as const) {
    await expect(dialog.getByRole("link", { name })).toHaveAttribute("href", href);
  }
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

for (const route of ["/", "/archive"] as const) {
  test(`widening ${route} with its mobile menu open restores visible focus`, async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile breakpoint contract");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    await page.getByRole("button", { name: "Menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 900 });

    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active || active === document.body) return false;
          const style = getComputedStyle(active);
          return (
            active.getClientRects().length > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            active.closest('nav[aria-label^="Primary"]') !== null
          );
        }),
      )
      .toBe(true);
  });
}

test("desktop theme controls expose, apply, and persist all three themes", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("desktop"), "Desktop theme controls");
  await page.goto("/");
  // Give the dev server / hydration a brief settle window; the parity
  // ThemeSwitcher is present in a clean browser but the e2e runner can race
  // the first compile after previous tests.
  await page.waitForTimeout(600);
  // Locate by stable id rather than the dynamic aria-label ("Switch to X
  // theme"), which depends on the currently resolved theme.
  const container = page.locator("#theme-switcher");
  await expect(container).toBeVisible();
  const controls = container.getByRole("button");
  await expect(controls).toHaveCount(3);
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  for (const theme of ["light", "dark", "red"] as const) {
    await container.getByRole("button", { name: `Switch to ${theme} theme` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  }

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "red");
  await expect(
    container.getByRole("button", { name: "Switch to red theme" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("mobile menu exposes keyboard-operable theme choices", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile theme controls");
  await page.goto("/archive");
  await page.getByRole("button", { name: "Menu" }).click();

  const controls = page.locator("#mobile-theme-switcher");
  await expect(controls.getByRole("button")).toHaveCount(3);
  const red = controls.getByRole("button", { name: "Switch to red theme" });
  await red.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "red");
  await expect(red).toHaveAttribute("aria-pressed", "true");
});

test("style-reference radios expose a visible keyboard focus indicator", async ({ page }) => {
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  const expand = page.getByRole("radio", { name: "Expand" });
  await expand.focus();

  const label = expand.locator("xpath=..");
  await expect(label).toHaveCSS("opacity", "1");
  await expect.poll(() => label.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");
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
  await expect(page.locator("#theme-switcher")).toBeHidden();
  await expect(page.locator('[role="status"][aria-label^="Loading"]')).toBeHidden();
  await context.close();
});

test("mobile primary navigation remains usable when JavaScript is disabled", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: String(testInfo.project.use.baseURL),
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  for (const route of ["/", "/archive"] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const fallback = page.locator(".artcovr-noscript-nav");
    await expect(fallback).toBeVisible();
    await expect(page.locator(".artcovr-js-menu-trigger")).toBeHidden();
    for (const [name, href] of [
      ["Home", "/"],
      ["Archive", "/archive"],
      ["My Images", "/my-images"],
      ["About", "/about"],
      ["Sign in", "/sign-in"],
    ] as const) {
      await expect(fallback.getByRole("link", { name, exact: true })).toHaveAttribute(
        "href",
        href,
      );
    }
  }

  await page.locator(".artcovr-noscript-nav").getByRole("link", {
    name: "About",
    exact: true,
  }).click();
  await expect(page).toHaveURL(/\/about\/?$/);
  await context.close();
});

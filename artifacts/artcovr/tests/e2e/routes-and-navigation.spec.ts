import { expect, test } from "@playwright/test";
import { assertUsablePage, useDeterministicSignIn } from "./fixtures";

const routes = [
  {
    path: "/",
    title: "Curated Cover Art for Music Releases and Artists | ARTCOVR",
    robots: "index, follow",
    selector: "#hero-title",
  },
  {
    path: "/archive",
    title: "Curated Cover Art Archive for Music Releases | ARTCOVR",
    robots: "index, follow",
    selector: 'section[aria-label="Artwork archive"]',
  },
  {
    path: "/product/cart-of-hours",
    title: /Cart of Hours .* ARTCOVR/,
    robots: "index, follow",
    selector: "main h1",
  },
  {
    path: "/checkout/cart-of-hours",
    title: "Secure Checkout | ARTCOVR",
    robots: "noindex, nofollow, noarchive",
    selector: "main h1",
  },
  {
    path: "/sign-in",
    title: "Sign In | ARTCOVR",
    robots: "noindex, nofollow, noarchive",
    selector: 'input[name="identifier"]',
  },
  {
    path: "/not-a-storefront-route",
    title: "Page Not Found | ARTCOVR",
    robots: "noindex, nofollow, noarchive",
    selector: "main h1",
  },
] as const;

test.describe("direct route loads and refreshes", () => {
  test.use({ reducedMotion: "reduce" });

  for (const route of routes) {
    test(`${route.path} keeps its content and metadata after refresh`, async ({
      page,
    }) => {
      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await assertUsablePage(page);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        route.robots,
      );
      await expect(page.locator(route.selector).first()).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      await assertUsablePage(page);
      await expect(page).toHaveTitle(route.title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        route.robots,
      );
      await expect(page.locator(route.selector).first()).toBeVisible();
    });
  }
});

test("protected account routes preserve the requested destination", async ({
  page,
}) => {
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fmy-images/);

  await page.goto("/catalog-intelligence", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(
    /\/sign-in\?redirect_url=%2Fcatalog-intelligence/,
  );
});

test("the signed-in ARTCOVR mark returns to the homepage", async ({ page }) => {
  await useDeterministicSignIn(page);
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });

  await page.getByRole("link", { name: "ARTCOVR home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hero-title")).toBeVisible();
});

test("product review moves into checkout without a blank transition", async ({
  page,
}) => {
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Review license" }).click();
  await expect(page).toHaveURL(/\/checkout\/cart-of-hours$/);
  await expect(page.getByText("Checkout review", { exact: true })).toBeVisible();
  await assertUsablePage(page);
});

test("mobile intro stays visible until it completes and then restores keyboard focus", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const preloader = page.locator("#artcovr-preloader");
    await expect(preloader).toBeVisible();
    await expect(preloader).toHaveAttribute("aria-label", /Loading \d+ percent/);
    await expect(page.locator("#page")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#page")).toHaveAttribute("inert", "");

    await expect(preloader).toHaveCount(0, { timeout: 8_000 });
    await expect(page.locator("#page")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#page")).not.toHaveAttribute("inert", "");

    const opener = page.getByRole("button", { name: "Menu" });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  } finally {
    await context.close();
  }
});

test("reduced motion bypasses the mobile intro", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#artcovr-preloader")).toHaveCount(0, {
      timeout: 1_000,
    });
    await expect(page.locator("#page")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.locator("#page")).not.toHaveAttribute("inert", "");
  } finally {
    await context.close();
  }
});
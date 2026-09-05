import { expect, test } from "@playwright/test";

type AppMode = "public" | "staging";
const configuredMode = process.env.PLAYWRIGHT_ARTCOVR_MODE;
if (configuredMode !== "public" && configuredMode !== "staging") {
  throw new Error(
    "PLAYWRIGHT_ARTCOVR_MODE must explicitly identify the public or staging storefront.",
  );
}
const appMode: AppMode = configuredMode;

const publicRoutes = [
  ["/", /Cover art/i],
  ["/archive", /Cover art/i],
  ["/about", /Cover art made yours/i],
  ["/faq", /^FAQ$/i],
  ["/contact", /Custom inquiry/i],
  ["/license", /Clear before checkout/i],
  ["/refunds", /^Refunds$/i],
  ["/legal/privacy", /^Privacy$/i],
  ["/legal/terms", /^Terms$/i],
] as const;

test.describe(`${appMode} storefront route smoke`, () => {
  for (const [route, heading] of publicRoutes) {
    test(`${route} renders meaningful ARTCOVR content`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/SERGEY|EDITIONS|Final Cut|Takes|Vault/i);
      expect(pageErrors).toEqual([]);
    });
  }
});

test("legacy routes are real permanent redirects", async ({ request }) => {
  const bag = await request.get("/bag", { maxRedirects: 0 });
  expect(bag.status()).toBe(308);
  expect(bag.headers().location).toMatch(/\/archive$/);

  const shipping = await request.get("/shipping-and-return", { maxRedirects: 0 });
  expect(shipping.status()).toBe(308);
  expect(shipping.headers().location).toMatch(/\/refunds$/);
});

test("static export has no /api/health server route", async ({ request }) => {
  // In static export mode the /api/health Route Handler is removed.
  // Requesting it on the Cloudflare CDN returns 404.
  const response = await request.get("/api/health");
  expect(response.status()).toBe(404);
});

test("security headers are attached and implementation branding is suppressed", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();

  const account = await request.get("/my-images");
  expect(account.headers()["cache-control"]).toContain("no-store");
  expect(account.headers()["x-robots-tag"]).toContain("noindex");
});

test(`${appMode} HTML carries route descriptions and the correct indexing directive`, async ({ request }) => {
  const response = await request.get("/about");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<meta name="description" content="[^"]*ARTCOVR/i);
  if (appMode === "staging") {
    expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/i);
  } else {
    expect(html).toMatch(/<meta name="robots" content="[^"]*index/i);
    expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/i);
  }
});

test(`${appMode} pages expose descriptions while private routes remain noindex`, async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ARTCOVR/i);
  if (appMode === "staging") {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  } else {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/about$/);
  }

  for (const route of ["/sign-in", "/my-images"]) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  }
});

test(`${appMode} robots policy matches the active storefront mode`, async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const robots = await response.text();
  if (appMode === "staging") {
    expect(robots).toMatch(/^Disallow:\s*\/\s*$/im);
    expect(robots).not.toMatch(/^Sitemap:/im);
  } else {
    const origin = new URL(response.url()).origin;
    expect(robots).toMatch(/^Allow:\s*\/\s*$/im);
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/im);
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(robots).toContain(`Host: ${origin}`);
  }
});

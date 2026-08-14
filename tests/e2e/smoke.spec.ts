import { expect, test } from "@playwright/test";

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

test.describe("public route smoke", () => {
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

test("staging HTML carries route descriptions and a noindex directive", async ({ request }) => {
  const response = await request.get("/about");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toMatch(/<meta name="description" content="[^"]*ARTCOVR/i);
  expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/i);
});

test("staging pages expose descriptions and remain noindex", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /ARTCOVR/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);

  for (const route of ["/sign-in", "/my-images"]) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  }
});

test("private staging sends a site-wide robots block", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/Disallow:\s*\//i);
});

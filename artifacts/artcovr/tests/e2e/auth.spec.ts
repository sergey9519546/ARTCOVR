import { expect, test } from "@playwright/test";

test("signed-out visitors can still browse the public storefront", async ({
  page,
}) => {
  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  await expect(page.locator('section[aria-label="Artwork archive"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "ARTCOVR home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Curation" })).toHaveCount(0);
});

test("signed-out visitors are sent to the Clerk sign-in route", async ({
  page,
}) => {
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in(?:\/|\?|$)/, { timeout: 20_000 });
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
});

test("the branded sign-in screen offers email and Google authentication", async ({
  page,
}) => {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "CONTINUE WITH GOOGLE" })).toBeVisible();
});

test("signed-out checkout offers guest checkout with an email receipt", async ({
  page,
}) => {
  await page.goto("/checkout/cart-of-hours", { waitUntil: "domcontentloaded" });
  const guestCheckout = page.locator('section[aria-label="Guest checkout"]');
  await expect(guestCheckout).toBeVisible({ timeout: 20_000 });
  await expect(guestCheckout.getByLabel("Email for receipt")).toHaveAttribute("type", "email");
  await expect(guestCheckout.getByRole("button", { name: "Checkout as guest" })).toBeDisabled();
  await expect(guestCheckout.getByRole("link", { name: /already have an account/i }))
    .toHaveAttribute("href", "/sign-in?redirect_url=%2Fcheckout%2Fcart-of-hours");
});

test("signed-out visitors see account actions before preview generation", async ({
  page,
}) => {
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });
  const access = page.locator('section[aria-label="Preview account access"]');

  await expect(access).toBeVisible({ timeout: 20_000 });
  await expect(access.getByText("Sign in to make a preview.")).toBeVisible();
  await expect(access.getByRole("link", { name: "Sign in", exact: true }))
    .toHaveAttribute("href", "/sign-in?redirect_url=%2Fproduct%2Fcart-of-hours");
  await expect(access.getByRole("link", { name: "Create an account", exact: true }))
    .toHaveAttribute("href", "/sign-up?redirect_url=%2Fproduct%2Fcart-of-hours");
  await expect(page.getByRole("button", { name: "Generate image" })).toBeDisabled();
});
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
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
});
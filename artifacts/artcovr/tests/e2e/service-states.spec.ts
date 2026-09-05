import { expect, test } from "@playwright/test";
import {
  accountFixture,
  fixtureImage,
  fulfillJson,
  useDeterministicSignIn,
} from "./fixtures";

test("guest checkout validates email and surfaces a service failure", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/checkout", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillJson(
        route,
        {
          code: "artwork_unavailable",
          message: "That exclusive cover has already been reserved or sold.",
        },
        409,
      );
      return;
    }
    await fulfillJson(route, {
      purchaseId: "purchase-retry",
      checkoutUrl: "/archive",
      expiresAt: "2030-09-20T12:00:00.000Z",
      includedCredits: 3,
    });
  });
  await page.goto("/checkout/cart-of-hours", { waitUntil: "domcontentloaded" });
  const guest = page.locator('section[aria-label="Guest checkout"]');
  const checkout = guest.getByRole("button", { name: "Checkout as guest" });
  await guest.getByLabel("Email for receipt").fill("not-an-email");
  await page.getByRole("checkbox").check();
  await expect(checkout).toBeDisabled();

  await guest.getByLabel("Email for receipt").fill("buyer@example.test");
  await checkout.click();
  await expect(page.getByRole("alert")).toHaveText(
    "That exclusive cover has already been reserved or sold.",
  );
  await expect(checkout).toBeEnabled();
  await expect(page.getByRole("button", { name: "Try checkout again" })).toBeEnabled();
  await page.getByRole("button", { name: "Try checkout again" }).click();
  await expect(page).toHaveURL(/\/archive$/);
});

test("signed-in checkout sends no guest identity and follows the response", async ({
  page,
}) => {
  await useDeterministicSignIn(page);
  let checkoutBody: Record<string, unknown> | undefined;
  await page.route("**/api/checkout", async (route) => {
    checkoutBody = route.request().postDataJSON() as Record<string, unknown>;
    await fulfillJson(route, {
      purchaseId: "purchase-e2e",
      checkoutUrl: "/my-images",
      expiresAt: "2030-09-20T12:00:00.000Z",
      includedCredits: 3,
    });
  });
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) =>
    fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }),
  );
  await page.route("**/api/functions/v1/my-images", (route) =>
    fulfillJson(route, accountFixture()),
  );

  await page.goto("/checkout/cart-of-hours", { waitUntil: "domcontentloaded" });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/my-images$/);
  await expect(page.getByRole("heading", { name: "Buried Clocks" })).toBeVisible();
  expect(checkoutBody?.email).toBeNull();
});

test("generation succeeds, chains from its result, and rejects bad uploads", async ({
  page,
}) => {
  await useDeterministicSignIn(page);
  const requests: Array<Record<string, unknown>> = [];
  let generationNumber = 0;
  await page.route("**/api/functions/v1/generate-image", async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    generationNumber += 1;
    await fulfillJson(route, {
      generationId: `generation-${generationNumber}`,
      status: "running",
      statusUrl: `/functions/v1/generation-status?generationId=generation-${generationNumber}`,
    }, 202);
  });
  await page.route("**/api/functions/v1/generation-status?*", (route) =>
    fulfillJson(route, {
      generationId: new URL(route.request().url()).searchParams.get("generationId"),
      status: "succeeded",
      previewUrl: fixtureImage,
      errorCode: null,
      finishedAt: "2026-09-02T12:00:00.000Z",
    }),
  );
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });

  const prompt = page.getByLabel("Describe the image you want");
  await prompt.fill("Add amber light");
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page.getByText(/Generated image ready/)).toBeVisible();
  await expect(page.getByText("Watermarked preview")).toBeVisible();

  await prompt.fill("Now add grain");
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].referenceGenerationId).toBe("generation-1");

  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByText("Use a JPEG, PNG, or WebP image.")).toBeVisible();
  await expect(page.getByText("Uploading…")).toHaveCount(0);
});

test("generation and reference failures release every loading state", async ({
  page,
}) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/generate-image", (route) =>
    fulfillJson(route, {
      generationId: "generation-timeout",
      status: "running",
      statusUrl: "/functions/v1/generation-status?generationId=generation-timeout",
    }, 202),
  );
  await page.route("**/api/functions/v1/generation-status?*", (route) =>
    fulfillJson(route, {
      generationId: "generation-timeout",
      status: "timed_out",
      errorCode: "provider_timeout",
      finishedAt: "2026-09-02T12:00:00.000Z",
    }),
  );
  await page.route("**/api/functions/v1/upload-reference?*", (route) =>
    fulfillJson(
      route,
      { code: "invalid_reference", message: "The reference image could not be decoded." },
      422,
    ),
  );
  await page.goto("/product/cart-of-hours", { waitUntil: "domcontentloaded" });

  await page.getByLabel("Describe the image you want").fill("Add silver rain");
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page.getByText("Generation timed out. Your allowance was not used.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate image" })).toBeEnabled();
  await expect(page.getByText("Generating…")).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  await expect(page.getByText("The reference image could not be decoded.")).toBeVisible();
  await expect(page.getByText("Uploading…")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Attach a reference photo" }),
  ).toBeEnabled();
});

test("inquiry errors remain actionable and a retry can succeed", async ({ page }) => {
  await useDeterministicSignIn(page);
  let attempts = 0;
  await page.route("**/api/functions/v1/submit-inquiry", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillJson(
        route,
        {
          code: "inquiry_rate_limited",
          message: "Too many inquiries in the last hour. Try again later.",
        },
        429,
      );
      return;
    }
    await fulfillJson(
      route,
      {
        inquiryId: "inquiry-e2e",
        createdAt: "2026-09-02T12:00:00.000Z",
      },
      201,
    );
  });
  await page.goto("/contact", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Name").fill("Test Buyer");
  await page.getByLabel("Tell us about the release").fill("A deterministic release inquiry.");
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("alert")).toContainText("Too many inquiries");
  await expect(page.getByRole("button", { name: "Send inquiry" })).toBeEnabled();

  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("status")).toContainText("inquiry has been received");
});

test("My Images account failures announce a retry and empty accounts can browse", async ({
  page,
}) => {
  await useDeterministicSignIn(page);
  let attempts = 0;
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) =>
    fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }),
  );
  await page.route("**/api/functions/v1/my-images", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await fulfillJson(route, { code: "temporarily_unavailable", message: "Account data is temporarily unavailable." }, 503);
      return;
    }
    await fulfillJson(route, { purchases: [], generations: [], downloads: [] });
  });
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Account data is temporarily unavailable.");
  await expect(alert.getByRole("button", { name: "Try again" })).toBeEnabled();

  await alert.getByRole("button", { name: "Try again" }).click();
  const empty = page.getByRole("region", { name: "Empty image library" });
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("link", { name: "Browse the archive" })).toHaveAttribute(
    "href",
    "/archive",
  );
});

test("My Images renders owned purchases, generations, and downloads only", async ({
  page,
}) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) =>
    fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }),
  );
  await page.route("**/api/functions/v1/my-images", (route) =>
    fulfillJson(route, accountFixture()),
  );
  await page.goto("/my-images", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Buried Clocks" })).toBeVisible();
  await expect(page.getByText("Add a quiet amber glow.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download base" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download purchased result" }),
  ).toBeVisible();
  await expect(page.getByText("OTHER ACCOUNT PRIVATE PROMPT")).toHaveCount(0);
});
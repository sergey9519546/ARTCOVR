import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const realAuthE2eEnabled = process.env.ARTCOVR_REAL_AUTH_E2E === "1";
const emailDomain = process.env.ARTCOVR_E2E_EMAIL_DOMAIN?.replace(/^@/, "");
const password = process.env.ARTCOVR_E2E_PASSWORD;
const verificationCode = process.env.ARTCOVR_E2E_VERIFICATION_CODE;

const artwork = {
  id: "art_382f017ddadad8dcd971",
  slug: "buried-clocks",
  title: "Buried Clocks",
  amountCents: 3500,
};

test.use({
  launchOptions: {
    args: ["--disable-blink-features=AutomationControlled"],
  },
});

type DatabaseModule = typeof import("@workspace/db");

async function signUpWithVerifiedEmail(
  page: Page,
  email: string,
  accountPassword: string,
  code: string,
) {
  await page.goto(`/sign-up?redirect_url=${encodeURIComponent("/my-images")}`, {
    waitUntil: "domcontentloaded",
  });

  const emailInput = page.locator('input[name="emailAddress"]');
  await expect(emailInput).toBeVisible({ timeout: 20_000 });
  await emailInput.fill(email);
  await page.getByRole("button", { name: /^continue$/i }).click();

  const passwordInput = page.locator('input[name="password"]');
  if (await passwordInput.isVisible().catch(() => false)) {
    await passwordInput.fill(accountPassword);
  }

  for (const [name, value] of [
    ["firstName", "ARTCOVR"],
    ["lastName", "Test"],
  ]) {
    const input = page.locator(`input[name="${name}"]`);
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value);
    }
  }

  const verificationInput = page.locator('input[name="code"]');
  if (!(await verificationInput.isVisible().catch(() => false))) {
    const continueButton = page.getByRole("button", {
      name: /^(continue|create account)$/i,
    });
    await expect(continueButton).toBeVisible({ timeout: 20_000 });
    await continueButton.click();
  }

  await expect(verificationInput).toBeVisible({ timeout: 20_000 });
  await verificationInput.fill(code);
  await page
    .getByRole("button", {
      name: /^(continue|verify email|create account)$/i,
    })
    .click();
  const challengeFrame = page
    .locator('iframe[src*="challenges.cloudflare.com"], iframe[title*="Cloudflare"]')
    .first();
  if (await challengeFrame.isVisible().catch(() => false)) {
    const box = await challengeFrame.boundingBox();
    if (box) {
      await page.mouse.click(box.x + 18, box.y + 27);
      await page.waitForTimeout(5_000);
    }
  }
  if (
    (await page.getByRole("heading", { name: /create your account/i }).isVisible().catch(() => false)) ||
    (await page.getByText("Verify you are human", { exact: true }).isVisible().catch(() => false))
  ) {
    throw new Error(
      "Clerk kept the anti-bot challenge active; use a Clerk test tenant/configuration that permits automated browser signups.",
    );
  }
  await expect(page).toHaveURL(/\/my-images(?:\?|$)/, { timeout: 30_000 });
}

async function seedGuestPurchase(
  db: DatabaseModule,
  email: string,
  suffix: string,
) {
  const orderId = `e2e_guest_order_${suffix}`;
  const ledgerId = `e2e_guest_credit_${suffix}`;
  const now = new Date();

  await db.db.insert(db.artcovrOrders).values({
    id: orderId,
    clerkUserId: null,
    artworkId: artwork.id,
    artworkSlug: artwork.slug,
    customerEmail: email,
    idempotencyKey: `e2e_guest_checkout_${suffix}`,
    amountCents: artwork.amountCents,
    currency: "usd",
    saleMode: "repeatable",
    licenseTerms:
      "Non-exclusive commercial use license. The purchaser receives commercial rights to use this cover.",
    includedCredits: 3,
    status: "paid",
    reservationExpiresAt: new Date(now.getTime() + 31 * 60_000),
    paidAt: now,
    entitlementExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
  });
  await db.db.insert(db.artcovrCreditLedger).values({
    id: ledgerId,
    accountKey: email,
    orderId,
    entryType: "grant",
    amount: 3,
    reason: "Cover purchase credit grant",
    sourceId: `e2e_guest_source_${suffix}`,
  });

  return { orderId, ledgerId };
}

async function cleanGuestPurchase(
  db: DatabaseModule,
  orderId: string,
  ledgerId: string,
) {
  await db.db
    .delete(db.artcovrCreditLedger)
    .where(eq(db.artcovrCreditLedger.id, ledgerId));
  await db.db.delete(db.artcovrOrders).where(eq(db.artcovrOrders.id, orderId));
}

async function deleteClerkUserByEmail(email: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;

  const response = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Could not find the test Clerk user (${response.status}).`);
  }

  const users = (await response.json()) as Array<{ id: string }>;
  await Promise.all(
    users.map(async (user) => {
      const deletion = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      if (!deletion.ok && deletion.status !== 404) {
        throw new Error(`Could not delete the test Clerk user (${deletion.status}).`);
      }
    }),
  );
}

test.describe("guest purchase claim", () => {
  test.skip(
    !realAuthE2eEnabled ||
      !emailDomain ||
      !password ||
      !verificationCode ||
      !process.env.CLERK_SECRET_KEY,
    "Set ARTCOVR_REAL_AUTH_E2E=1, ARTCOVR_E2E_EMAIL_DOMAIN, ARTCOVR_E2E_PASSWORD, ARTCOVR_E2E_VERIFICATION_CODE, and CLERK_SECRET_KEY to run the real Clerk journey.",
  );

  test("claims the matching guest purchase after signup and isolates another account", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const buyerEmail = `artcovr-guest-${suffix}@${emailDomain}`;
    const otherEmail = `artcovr-other-${suffix}@${emailDomain}`;
    const db = await import("@workspace/db");
    const fixture = await seedGuestPurchase(db, buyerEmail, suffix);
    const buyerContext = await browser.newContext();
    const otherContext = await browser.newContext();

    try {
      const buyerPage = await buyerContext.newPage();
      await signUpWithVerifiedEmail(
        buyerPage,
        buyerEmail,
        password!,
        verificationCode!,
      );
      await expect(buyerPage.getByRole("heading", { name: artwork.title })).toBeVisible();
      await expect(
        buyerPage.getByText("Generations remaining").locator(".."),
      ).toContainText("3");

      const claimResponses: Array<{
        claimedOrderIds?: string[];
        claimedCredits?: number;
      }> = [];
      const otherPage = await otherContext.newPage();
      otherPage.on("response", async (response) => {
        if (!response.url().includes("/api/functions/v1/claim-guest-purchases")) {
          return;
        }
        claimResponses.push(
          (await response.json()) as {
            claimedOrderIds?: string[];
            claimedCredits?: number;
          },
        );
      });
      await signUpWithVerifiedEmail(
        otherPage,
        otherEmail,
        password!,
        verificationCode!,
      );
      await expect(
        otherPage.getByText("No purchases or generated images yet."),
      ).toBeVisible();
      await expect(
        otherPage.getByRole("heading", { name: artwork.title }),
      ).toHaveCount(0);
      await expect
        .poll(() => claimResponses, { timeout: 10_000 })
        .toEqual([{ claimedOrderIds: [], claimedCredits: 0 }]);
    } finally {
      await buyerContext.close();
      await otherContext.close();
      try {
        await cleanGuestPurchase(db, fixture.orderId, fixture.ledgerId);
      } finally {
        try {
          await deleteClerkUserByEmail(buyerEmail);
          await deleteClerkUserByEmail(otherEmail);
        } finally {
          await db.pool.end();
        }
      }
    }
  });
});
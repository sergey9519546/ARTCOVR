import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const realAuthE2eEnabled = process.env.ARTCOVR_REAL_AUTH_E2E === "1";
const emailDomain = (process.env.ARTCOVR_E2E_EMAIL_DOMAIN ?? "example.com").replace(/^@/, "");
const password = process.env.ARTCOVR_E2E_PASSWORD ?? `Artcovr-${randomUUID()}-aA1!`;
// Clerk development +clerk_test addresses use this documented test-only OTP.
const verificationCode = process.env.ARTCOVR_E2E_VERIFICATION_CODE ?? "424242";

const artwork = {
  id: "art_382f017ddadad8dcd971",
  slug: "buried-clocks",
  title: "Buried Clocks",
  amountCents: 3500,
};

type DatabaseModule = typeof import("@workspace/db");

function assertRealAuthEnvironment() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
    throw new Error("Real Clerk browser checks refuse production runtime mode and deployments.");
  }
  const publishableKey =
    process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  if (
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !publishableKey?.startsWith("pk_test_")
  ) {
    throw new Error("Real Clerk browser checks require matching sk_test_/pk_test_ tenant keys.");
  }
  if (
    process.env.CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_PUBLISHABLE_KEY !== publishableKey
  ) {
    throw new Error("The API and storefront must use the same Clerk development publishable key.");
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Real Clerk browser checks require a disposable loopback DATABASE_URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    !/^artcovr_(?:check|test|e2e)(?:_[a-z0-9_-]+)?$/i.test(databaseUrl.pathname.slice(1))
  ) {
    throw new Error("Real Clerk browser checks refuse remote databases; use disposable loopback PostgreSQL.");
  }
  if (process.env.PLAYWRIGHT_BASE_URL) {
    const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL);
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname) ||
      baseUrl.username || baseUrl.password ||
      baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash
    ) {
      throw new Error("Real Clerk browser checks require a loopback storefront backed by the disposable database.");
    }
  }
}


let clerkTestingReady: Promise<void> | undefined;

async function enableClerkTestingToken(page: Page) {
  clerkTestingReady ??= clerkSetup({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    dotenv: false,
    debug: false,
  });
  await clerkTestingReady;
  // Use Clerk's supported testing integration so the Frontend API and the
  // browser component both recognize the development testing token.
  await setupClerkTestingToken({
    page,
    options: { frontendApiUrl: developmentClerkFrontendHost() },
  });
}

function developmentClerkFrontendHost() {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY!;
  return Buffer.from(key.slice("pk_test_".length), "base64").toString("utf8").replace(/\$$/, "");
}

async function signUpWithVerifiedEmail(
  page: Page,
  email: string,
  accountPassword: string,
  code: string,
) {
  const diagnostics: Array<Record<string, unknown>> = [];
  const frontendHost = developmentClerkFrontendHost();
  const record = (entry: Record<string, unknown>) => {
    if (diagnostics.length < 40) diagnostics.push(entry);
  };
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.hostname === frontendHost && url.pathname.startsWith("/v1/")) {
      record({ phase: "transport", method: request.method(), error: request.failure()?.errorText });
    }
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.hostname !== frontendHost || !url.pathname.startsWith("/v1/")) return;
    const path = url.pathname.replace(/\/(sign_ups|sign_ins|sessions|clients)\/[^/]+/g, "/$1/:id");
    const entry: Record<string, unknown> = { method: response.request().method(), path, status: response.status() };
    record(entry);
    try {
      const body = await response.json() as {
        errors?: Array<{ code?: string }>;
        response?: { object?: string; status?: string; missing_fields?: string[]; unverified_fields?: string[]; sign_up?: { status?: string; missing_fields?: string[]; unverified_fields?: string[] } };
      };
      if (body.errors) entry.errors = body.errors.map((error) => error.code);
      const signup = body.response?.sign_up ?? (body.response?.object === "sign_up" ? body.response : undefined);
      if (signup) {
        entry.signupStatus = signup.status;
        entry.missingFields = signup.missing_fields;
        entry.unverifiedFields = signup.unverified_fields;
      }
    } catch {
      // A non-JSON response is represented by the method, path and status.
    }
  });

  const fillVisibleFields = async () => {
    for (const [name, value] of [
      ["password", accountPassword],
      ["firstName", "ARTCOVR"],
      ["lastName", "Test"],
      ["username", `artcovr_${email.split("@")[0].replace(/[^a-z0-9]/gi, "")}`],
    ]) {
      const input = page.locator(`input[name="${name}"]`);
      if (await input.isVisible().catch(() => false)) await input.fill(value);
    }
    const legalAccepted = page.locator('input[name="legalAccepted"]');
    if (await legalAccepted.isVisible().catch(() => false)) await legalAccepted.check();
  };
  const verificationInput = page.getByRole("textbox", {
    name: "Enter verification code", exact: true,
  });
  const verificationGroup = page.locator(".cl-otpCodeFieldInputs");
  const verificationReady = async () =>
    await verificationInput.count() === 1 &&
    await verificationGroup.isVisible().catch(() => false);
  const continueButton = page.getByRole("button", { name: /^(continue|create account)$/i });

  try {
    await enableClerkTestingToken(page);
    await page.goto(`/sign-up?redirect_url=${encodeURIComponent("/my-images")}`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => Boolean((window as Window & { Clerk?: { loaded?: boolean } }).Clerk?.loaded)),
      { timeout: 20_000, message: "Clerk did not finish loading the development instance." },
    ).toBe(true);
    const emailInput = page.locator('input[name="emailAddress"]');
    await expect(emailInput).toBeVisible({ timeout: 20_000 });
    await emailInput.fill(email);
    await expect(emailInput).toHaveValue(email);
    await fillVisibleFields();
    await expect(continueButton).toBeVisible({ timeout: 20_000 });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // Clerk can collect the password on a second screen when identifier-first
    // signup is enabled. Wait for that actual screen or email verification.
    await expect.poll(async () => {
      if (await verificationReady()) return "verify";
      const passwordInput = page.locator('input[name="password"]');
      if (await passwordInput.isVisible().catch(() => false)) {
        if (!(await passwordInput.inputValue())) return "password";
      }
      return "pending";
    }, { timeout: 20_000, message: "Clerk did not render the next signup step." }).not.toBe("pending");
    if (!(await verificationReady())) {
      await fillVisibleFields();
      await expect(continueButton).toBeVisible();
      await continueButton.click();
    }

    // Clerk renders visible OTP slots over its accessible input. Assert the
    // visible widget, then type as documented rather than filling a hidden input.
    await expect(verificationGroup).toBeVisible({ timeout: 20_000 });
    await expect(verificationInput).toHaveCount(1);
    await expect(verificationInput).toBeEditable();
    await verificationInput.pressSequentially(code);
    await expect(page).toHaveURL(/\/my-images(?:\?|$)/, { timeout: 30_000 });
  } catch (error) {
    const fields = await page.locator("input").evaluateAll((inputs) => inputs.map((input) => ({
      name: input.getAttribute("name"),
      type: input.getAttribute("type"),
      autocomplete: input.getAttribute("autocomplete"),
      ariaLabel: input.getAttribute("aria-label"),
      role: input.getAttribute("role"),
      display: window.getComputedStyle(input).display,
      visibility: window.getComputedStyle(input).visibility,
      width: input.getBoundingClientRect().width,
      height: input.getBoundingClientRect().height,
    }))).catch(() => []);
    // Query strings, request bodies, user IDs, emails and field values are
    // intentionally excluded from the diagnostic receipt.
    console.error("CLERK SIGNUP DIAGNOSTICS", JSON.stringify({ requests: diagnostics, fields }));
    throw error;
  }
}

async function seedGuestPurchase(
  db: DatabaseModule,
  email: string,
  suffix: string,
) {
  const orderId = `e2e_guest_order_${suffix}`;
  const ledgerId = `e2e_guest_credit_${suffix}`;
  const now = new Date();

  return db.db.transaction(async (tx) => {
  await tx.insert(db.artcovrOrders).values({
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
  await tx.insert(db.artcovrCreditLedger).values({
    id: ledgerId,
    clerkUserId: `guest:${orderId}`,
    accountKey: `guest:${orderId}`,
    orderId,
    entryType: "grant",
    amount: 3,
    reason: "Cover purchase credit grant",
    sourceId: `e2e_guest_source_${suffix}`,
  });

  return { orderId, ledgerId };
  });
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

type ClerkTestUser = {
  id: string;
  created_at: number;
  email_addresses: Array<{ email_address: string }>;
};

async function getClerkUsersByEmail(email: string) {
  const response = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY!}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Could not find the test Clerk user (${response.status}).`);
  }
  return await response.json() as ClerkTestUser[];
}

async function deleteClerkUserByEmail(email: string, startedAt: number) {
  const users = await getClerkUsersByEmail(email);
  // Cleanup is restricted to this run's new, exact test identities.
  for (const user of users) {
    if (
      !Number.isFinite(user.created_at) ||
      user.created_at < startedAt ||
      !user.email_addresses.some((address) => address.email_address === email)
    ) {
      throw new Error("Refusing to delete a Clerk account that predates this test run or has another email.");
    }
    const deletion = await fetch(`https://api.clerk.com/v1/users/${user.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY!}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!deletion.ok && deletion.status !== 404) {
      throw new Error(`Could not delete the test Clerk user (${deletion.status}).`);
    }
  }
}

test.describe("guest purchase claim", () => {
  test.skip(
    !realAuthE2eEnabled || !process.env.CLERK_SECRET_KEY,
    "Set ARTCOVR_REAL_AUTH_E2E=1 and the matching development Clerk keys to run the real browser journey.",
  );

  test("claims the matching guest purchase after signup and isolates another account", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    assertRealAuthEnvironment();
    delete process.env.CLERK_TESTING_TOKEN;
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
    const buyerEmail = `artcovr-guest-${suffix}+clerk_test@${emailDomain}`;
    const otherEmail = `artcovr-other-${suffix}+clerk_test@${emailDomain}`;
    const db = await import("@workspace/db");
    let fixture: Awaited<ReturnType<typeof seedGuestPurchase>> | undefined;
    let buyerContext: BrowserContext | undefined;
    let otherContext: BrowserContext | undefined;
    let cleanupClerkUsers = false;
    let primaryFailure: unknown;
    const startedAt = Date.now();

    try {
      const existingUsers = await Promise.all([
        getClerkUsersByEmail(buyerEmail),
        getClerkUsersByEmail(otherEmail),
      ]);
      if (existingUsers.some((users) => users.length !== 0)) {
        throw new Error("Refusing to reuse or clean up an existing Clerk test identity.");
      }
      cleanupClerkUsers = true;
      fixture = await seedGuestPurchase(db, buyerEmail, suffix);
      buyerContext = await browser.newContext();
      otherContext = await browser.newContext();
      const buyerPage = await buyerContext.newPage();
      await signUpWithVerifiedEmail(
        buyerPage,
        buyerEmail,
        password,
        verificationCode,
      );
      const ownedPurchase = buyerPage.locator("article").filter({
        has: buyerPage.getByRole("heading", { name: artwork.title, exact: true }),
      });
      await expect(ownedPurchase).toHaveCount(1);
      await expect(ownedPurchase.getByRole("heading", { name: artwork.title, exact: true })).toBeVisible();
      await expect(
        ownedPurchase.getByText("Credits remaining", { exact: true }).locator("..").locator("dd"),
      ).toHaveText("3");
      await expect(
        buyerPage.getByText("3 image-edit credits available across your purchases.", { exact: true }),
      ).toBeVisible();

      const buyerUsers = await getClerkUsersByEmail(buyerEmail);
      expect(buyerUsers).toHaveLength(1);
      const [claimedOrder] = await db.db.select({
        owner: db.artcovrOrders.clerkUserId,
      }).from(db.artcovrOrders).where(eq(db.artcovrOrders.id, fixture.orderId));
      const [claimedLedger] = await db.db.select({
        owner: db.artcovrCreditLedger.clerkUserId,
        accountKey: db.artcovrCreditLedger.accountKey,
        amount: db.artcovrCreditLedger.amount,
      }).from(db.artcovrCreditLedger).where(eq(db.artcovrCreditLedger.id, fixture.ledgerId));
      expect({
        orderOwnedByBuyer: claimedOrder?.owner === buyerUsers[0]?.id,
        ledgerOwnedByBuyer: claimedLedger?.owner === buyerUsers[0]?.id,
        accountKeyOwnedByBuyer: claimedLedger?.accountKey === buyerUsers[0]?.id,
        grantedCredits: claimedLedger?.amount,
      }).toEqual({
        orderOwnedByBuyer: true,
        ledgerOwnedByBuyer: true,
        accountKeyOwnedByBuyer: true,
        grantedCredits: 3,
      });

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
    } catch (error) {
      primaryFailure = error;
    } finally {
      const cleanupErrors: unknown[] = [];
      const cleanups: Array<() => Promise<unknown>> = [];
      if (buyerContext) cleanups.push(() => buyerContext!.close());
      if (otherContext) cleanups.push(() => otherContext!.close());
      if (fixture) cleanups.push(() => cleanGuestPurchase(db, fixture!.orderId, fixture!.ledgerId));
      if (cleanupClerkUsers) {
        cleanups.push(() => deleteClerkUserByEmail(buyerEmail, startedAt));
        cleanups.push(() => deleteClerkUserByEmail(otherEmail, startedAt));
      }
      cleanups.push(() => db.pool.end());
      for (const cleanup of cleanups) {
        try {
          await cleanup();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (cleanupErrors.length) {
        throw new AggregateError(
          [...(primaryFailure ? [primaryFailure] : []), ...cleanupErrors],
          "The real-auth journey or cleanup failed; review the underlying errors before rerunning.",
        );
      }
    }
    if (primaryFailure) throw primaryFailure;
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import type { AccountCreditActivity, AccountData } from "./functions.ts";
import { appendOlderCreditActivity, generationHistoryLabel } from "./account-activity.ts";

const recent: AccountCreditActivity = { purchaseId: "purchase", artworkTitle: "Cover", event: "generation", label: "Image edit", amount: -1, occurredAt: "2026-09-08T12:00:00Z" };
const older: AccountCreditActivity = { ...recent, event: "grant", label: "Included credits", amount: 5, occurredAt: "2026-09-01T12:00:00Z" };
function account(): AccountData {
  return {
    totalCreditBalance: 0,
    purchases: [{ id: "purchase", artworkId: "artwork", artworkTitle: "Cover", artworkSlug: "cover", saleMode: "repeatable", status: "refunded", amountCents: 3500, currency: "USD", paidAt: "2026-09-01T12:00:00Z", entitlementExpiresAt: null, selectedPreviewGenerationId: null, resetSource: "original", accessRevokedAt: "2026-09-08T12:00:00Z", accessRevocationReason: "refund", remainingGenerations: 0, remainingCredits: 0 }],
    generations: [{ id: "new-edit", artworkId: "artwork", purchaseId: "purchase", phase: "purchased", status: "succeeded", createdAt: "2026-09-08T12:00:00Z", expiresAt: "2026-10-01T00:00:00Z" }],
    downloads: [],
    unavailableDownloads: [{ kind: "base", purchaseId: "purchase", artworkId: "artwork", generationId: null, code: "asset_unavailable" }],
    creditActivity: [recent],
    creditActivityNextCursor: "page-2",
  };
}

test("older activity appends without rolling back current balances, media access or new entries", () => {
  const current = account();
  const stalePage: AccountData = {
    ...current,
    totalCreditBalance: 5,
    purchases: [{ ...current.purchases[0], status: "paid", accessRevokedAt: null, remainingCredits: 5 }],
    generations: [],
    downloads: [{ kind: "base", purchaseId: "purchase", artworkId: "artwork", generationId: null, url: "https://storage.example/stale", expiresAt: "2026-10-01T00:00:00Z" }],
    unavailableDownloads: [],
    creditActivity: [older],
    creditActivityNextCursor: "page-3",
  };
  const merged = appendOlderCreditActivity(current, stalePage, "page-2");
  assert.equal(merged.totalCreditBalance, 0);
  for (const key of ["purchases", "generations", "downloads", "unavailableDownloads"] as const) assert.strictEqual(merged[key], current[key]);
  assert.deepEqual(merged.creditActivity, [recent, older]);
  assert.equal(merged.creditActivityNextCursor, "page-3");
  assert.deepEqual(current.creditActivity, [recent]);
  assert.equal(current.creditActivityNextCursor, "page-2");
});

test("distinct ledger events with identical public fields are never collapsed", () => {
  const current = account();
  const identicalRows = Array.from({ length: 27 }, () => ({ ...recent }));
  const result = appendOlderCreditActivity(current, { creditActivity: identicalRows.slice(0, 25), creditActivityNextCursor: "page-3" }, "page-2");
  const final = appendOlderCreditActivity(result, { creditActivity: identicalRows.slice(25), creditActivityNextCursor: null }, "page-3");
  assert.equal(final.creditActivity?.length, 28);
  assert.strictEqual(result.creditActivity?.[0], recent);
  assert.equal(final.creditActivityNextCursor, null);
});

test("repeated page responses are ignored by cursor rather than public event fields", () => {
  const current = account();
  const page = { creditActivity: [older], creditActivityNextCursor: "page-3" };
  const first = appendOlderCreditActivity(current, page, "page-2");
  assert.strictEqual(appendOlderCreditActivity(first, page, "page-2"), first);
  assert.deepEqual(first.creditActivity, [recent, older]);
});

test("a stale continuation cannot append or roll back a cursor changed by a refresh or page", () => {
  for (const cursor of ["new-page", null, undefined]) {
    const current = { ...account(), creditActivityNextCursor: cursor };
    assert.strictEqual(appendOlderCreditActivity(current, { creditActivity: [older], creditActivityNextCursor: "page-3" }, "page-2"), current);
  }
});

test("missing history is compatible without treating an incomplete response as the last page", () => {
  const current = { ...account(), creditActivity: undefined };
  assert.deepEqual(appendOlderCreditActivity(current, { creditActivity: [older], creditActivityNextCursor: null }, "page-2").creditActivity, [older]);
  assert.strictEqual(appendOlderCreditActivity(current, {}, "page-2"), current);
});

test("generation history labels derive only from privacy-safe phase data", () => {
  assert.equal(generationHistoryLabel({ phase: "purchased" }), "Generated edit");
  assert.equal(generationHistoryLabel({ phase: "preview" }), "Generated preview");
});

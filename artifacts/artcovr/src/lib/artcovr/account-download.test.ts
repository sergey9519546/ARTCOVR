import assert from "node:assert/strict";
import test from "node:test";
import type { AccountData, AccountDownload } from "./functions";
import { resolveCurrentDownload } from "./account-download";

const now = Date.parse("2026-09-07T12:00:00.000Z");
const oldDownload: AccountDownload = { kind: "base", purchaseId: "purchase", artworkId: "artwork", generationId: null, expiresAt: "2026-10-01T00:00:00Z", url: "https://storage.example/old" };
function freshAccount(): AccountData {
  return {
    purchases: [{ id: "purchase", artworkId: "artwork", artworkTitle: "Cover", artworkSlug: "cover", saleMode: "repeatable", status: "paid", amountCents: 3500, currency: "USD", paidAt: "2026-09-07T10:00:00Z", entitlementExpiresAt: oldDownload.expiresAt, selectedPreviewGenerationId: null, resetSource: "original", accessRevokedAt: null, accessRevocationReason: null, remainingGenerations: 4 }],
    generations: [],
    downloads: [{ ...oldDownload, url: "https://storage.example/fresh", urlExpiresAt: new Date(now + 300_000).toISOString() }],
  };
}

test("download selection uses only a newly authorized URL with the same asset identity", () => {
  const account = freshAccount();
  assert.equal(resolveCurrentDownload(account, oldDownload, now).url, "https://storage.example/fresh");
  for (const mismatch of [{ kind: "selected_preview" as const }, { artworkId: "different" }, { purchaseId: "another-buyer" }, { generationId: "different-result" }]) {
    assert.throws(() => resolveCurrentDownload(account, { ...oldDownload, ...mismatch }, now));
  }
});

test("a refresh showing refund, revocation or expired entitlement never falls back to the old URL", () => {
  for (const change of [{ status: "refunded" as const }, { accessRevokedAt: "2026-09-07T11:00:00Z" }, { entitlementExpiresAt: new Date(now).toISOString() }, { entitlementExpiresAt: "invalid" }]) {
    const account = freshAccount();
    Object.assign(account.purchases[0], change);
    assert.throws(() => resolveCurrentDownload(account, oldDownload, now), /no longer active/);
  }
  const missing = freshAccount();
  missing.purchases = [];
  assert.throws(() => resolveCurrentDownload(missing, oldDownload, now), /no longer active/);
});

test("unavailable and expired refreshed links fail visibly without reusing the old URL", () => {
  const account = freshAccount();
  account.downloads = [];
  account.unavailableDownloads = [{ kind: "base", purchaseId: "purchase", artworkId: "artwork", generationId: null, code: "asset_unavailable" }];
  assert.throws(() => resolveCurrentDownload(account, oldDownload, now), /could not be prepared/);
  const expired = freshAccount();
  expired.downloads[0].urlExpiresAt = new Date(now - 1).toISOString();
  assert.throws(() => resolveCurrentDownload(expired, oldDownload, now), /could not be prepared/);
});

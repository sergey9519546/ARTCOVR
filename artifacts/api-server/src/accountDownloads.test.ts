import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { artcovrGenerations, artcovrOrders, db } from "@workspace/db";
import { getPublicCatalog } from "./catalog";
import { serializeAccount } from "./generationService";

test("account refresh preserves paid results through a base storage failure and removes access after revocation", async () => {
  const userId = `account-download-test-${randomUUID()}`;
  const purchaseId = randomUUID();
  const generationId = randomUUID();
  const artwork = getPublicCatalog()[0];
  const signed: string[] = [];
  const io = {
    ensureBaseObject: async () => { throw new Error("private/master location unavailable"); },
    signPrivate: async (key: string) => { signed.push(key); return `https://storage.example/${key === "test-clean" ? "clean" : "preview"}`; },
  };
  try {
    await db.insert(artcovrOrders).values({ id: purchaseId, clerkUserId: userId, artworkId: artwork.id, artworkSlug: artwork.slug, idempotencyKey: purchaseId, amountCents: 3500, saleMode: "repeatable", licenseTerms: "test", includedCredits: 4, status: "paid", paidAt: new Date() });
    await db.insert(artcovrGenerations).values({ id: generationId, clerkUserId: userId, artworkId: artwork.id, purchaseId, phase: "purchased", status: "succeeded", prompt: "Private customer prompt", sourceObjectKey: "private-source", previewObjectKey: "test-preview", cleanObjectKey: "test-clean", expiresAt: new Date(Date.now() + 60_000) });
    const account = await serializeAccount(userId, io);
    assert.equal(account.purchases.length, 1);
    assert.equal(account.generations.length, 1);
    assert.equal(account.downloads.length, 1);
    assert.equal(account.downloads[0].kind, "purchased_result");
    assert.deepEqual(account.unavailableDownloads, [{ kind: "base", purchaseId, artworkId: artwork.id, generationId: null, code: "asset_unavailable" }]);
    assert.doesNotMatch(JSON.stringify(account), /private\/master|private-source|test-clean|test-preview/);
    assert.ok(Date.parse(account.downloads[0].urlExpiresAt) < Date.parse(account.downloads[0].expiresAt));

    const foreign = await serializeAccount(`foreign-${userId}`, io);
    assert.equal(foreign.downloads.length, 0);
    assert.equal(foreign.unavailableDownloads.length, 0);
    assert.equal(foreign.purchases.length, 0);
    assert.equal(foreign.generations.length, 0);

    await db.update(artcovrOrders).set({ accessRevokedAt: new Date(), accessRevocationReason: "stripe_dispute" }).where(eq(artcovrOrders.id, purchaseId));
    signed.length = 0;
    const revoked = await serializeAccount(userId, io);
    assert.equal(revoked.downloads.length, 0);
    assert.equal(revoked.unavailableDownloads.length, 0);
    assert.equal(revoked.generations[0].cleanUrl, undefined);
    assert.equal(revoked.generations[0].previewUrl, undefined);
    assert.deepEqual(signed, []);
  } finally {
    await db.delete(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, userId));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.clerkUserId, userId));
  }
});

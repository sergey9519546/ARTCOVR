import assert from "node:assert/strict";
import test from "node:test";
import { prepareAccountDownload } from "./accountDownload";

const identity = { kind: "base" as const, purchaseId: "purchase", artworkId: "artwork", generationId: null };
const now = Date.parse("2026-09-07T12:00:00.000Z");
const expiry = new Date(now + 60 * 60_000);

test("download signing reports its short lifetime separately from the entitlement", async () => {
  const result = await prepareAccountDownload(identity, async () => "private/master.webp", expiry, async (key, ttl) => {
    assert.equal(key, "private/master.webp");
    assert.equal(ttl, 300);
    return "https://storage.example/signed";
  }, () => now);
  assert.equal(result.unavailable, null);
  assert.equal(result.download?.expiresAt, expiry.toISOString());
  assert.equal(result.download?.urlExpiresAt, new Date(now + 300_000).toISOString());
  assert.doesNotMatch(JSON.stringify(result), /private\/master/);
});

test("one failed object or signer preserves other downloads without exposing private errors", async () => {
  const entries = await Promise.all([
    prepareAccountDownload(identity, async () => { throw new Error("private/master.webp missing"); }, expiry, async () => "unused", () => now),
    prepareAccountDownload({ ...identity, kind: "selected_preview", generationId: "preview" }, async () => "private/preview.webp", expiry, async () => { throw new Error("storage secret sign failed"); }, () => now),
    prepareAccountDownload({ ...identity, kind: "purchased_result", generationId: "result" }, async () => "private/result.webp", expiry, async () => "https://storage.example/result", () => now),
  ]);
  assert.equal(entries.filter((entry) => entry.download).length, 1);
  assert.equal(entries.filter((entry) => entry.unavailable).length, 2);
  assert.deepEqual(entries[0].unavailable, { ...identity, code: "asset_unavailable" });
  assert.doesNotMatch(JSON.stringify(entries), /private\/|secret|sign failed|missing/);
});

test("signed URL lifetime cannot exceed the remaining purchase entitlement", async () => {
  let signed = 0;
  const result = await prepareAccountDownload(identity, async () => "key", new Date(now + 12_500), async (_key, ttl) => {
    signed += 1;
    assert.equal(ttl, 12);
    return "https://storage.example/signed";
  }, () => now);
  assert.equal(result.download?.urlExpiresAt, new Date(now + 12_000).toISOString());
  const expired = await prepareAccountDownload(identity, async () => "key", new Date(now - 1), async () => {
    signed += 1;
    return "https://storage.example/forbidden";
  }, () => now);
  assert.equal(expired.download, null);
  assert.equal(signed, 1);
});

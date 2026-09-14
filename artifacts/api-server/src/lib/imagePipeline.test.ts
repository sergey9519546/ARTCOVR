import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadBaseObject,
  ensureBaseObject,
  protectedBaseObjectKey,
} from "./imagePipeline";

const artworkId = "art_07bdf5aba1e72db9acd7";
const publicPreviewPath = "/assets/artworks/emerald-colonnade.jpg";

test("protected originals use an opaque private object key, not a public preview path", () => {
  assert.equal(
    protectedBaseObjectKey(artworkId),
    "artworks/base/art_07bdf5aba1e72db9acd7.jpg",
  );
  assert.notEqual(protectedBaseObjectKey(artworkId), publicPreviewPath);
});

test("a missing protected original fails closed without trying the public preview", async () => {
  const requestedKeys: string[] = [];
  await assert.rejects(
    downloadBaseObject(artworkId, async (key) => {
      requestedKeys.push(key);
      throw new Error("protected original is missing");
    }),
    /protected original is missing/,
  );
  assert.deepEqual(requestedKeys, [protectedBaseObjectKey(artworkId)]);
  assert.doesNotMatch(requestedKeys.join("\n"), /\/assets\/artworks\//);
});

test("a successful protected-original read returns bytes without a storage key", async () => {
  const original = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  let requestedKey = "";
  const bytes = await downloadBaseObject(artworkId, async (key) => {
    requestedKey = key;
    return original;
  });
  assert.deepEqual(bytes, original);
  assert.equal(requestedKey, protectedBaseObjectKey(artworkId));
  assert.doesNotMatch(JSON.stringify(bytes), /artworks\/base|assets\/artworks/);
});

test("an empty protected original fails closed", async () => {
  await assert.rejects(
    downloadBaseObject(artworkId, async () => new Uint8Array()),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "base_artwork_unavailable",
  );
});

test("base-object verification returns only the private key for internal consumers", async () => {
  const key = await ensureBaseObject(artworkId, async (requestedKey) => {
    assert.equal(requestedKey, protectedBaseObjectKey(artworkId));
    return new Uint8Array([0xff, 0xd8, 0xff]);
  });
  assert.equal(key, protectedBaseObjectKey(artworkId));
});
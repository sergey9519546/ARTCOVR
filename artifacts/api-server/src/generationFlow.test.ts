import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import {
  artcovrCreditLedger,
  artcovrGenerations,
  artcovrOrders,
  artcovrReferenceUploads,
  db,
} from "@workspace/db";
import { ImageProviderError, type ImageEditClient } from "@workspace/integrations-openai-ai-server/image";
import { getPublicCatalog } from "./catalog";
import { admitGeneration, runGeneration, generationStatus } from "./generationService";
import { addWatermark, createImageEditResult } from "./lib/imagePipeline";

async function fixture() {
  const userId = `edit-test-${randomUUID()}`;
  const artwork = getPublicCatalog()[0];
  const source = new Uint8Array(await sharp({ create: { width: 256, height: 256, channels: 3, background: "navy" } }).jpeg().toBuffer());
  const files = new Map<string, Uint8Array>([["original.jpg", source]]);
  const requests: Array<{ images: Uint8Array[]; prompt: string }> = [];
  const photoIds: string[] = [];
  const client = { images: { edit: async (input: { image: File[]; prompt: string }) => {
    requests.push({ images: await Promise.all(input.image.map(async (file) => new Uint8Array(await file.arrayBuffer()))), prompt: input.prompt });
    // Distinct versions ensure a wrong parent cannot pass an image equality check.
    const edited = await sharp({ create: { width: 256, height: 256, channels: 3, background: { r: requests.length * 30, g: 90, b: 180 } } }).png().toBuffer();
    return { _request_id: "req_real_provider_header", data: [{ b64_json: edited.toString("base64") }] };
  } } } as unknown as ImageEditClient;
  const io = {
    ensureBaseObject: async () => "original.jpg",
    downloadPrivate: async (key: string) => { const bytes = files.get(key); if (!bytes) throw new Error("Missing source"); return new Uint8Array(bytes); },
    uploadPrivate: async (key: string, bytes: Uint8Array) => { files.set(key, bytes); return key; },
    removePrivate: async (keys: string[]) => { for (const key of keys) files.delete(key); },
    createImageEditResult: (source: Uint8Array, prompt: string, size: 1024 | 2048, photo?: Uint8Array, contentType?: "image/jpeg" | "image/webp") => createImageEditResult(source, prompt, size, photo, contentType, client),
    addWatermark,
  };
  const input = { userId, artworkId: artwork.id, prompt: "Place me in the cover, keeping the existing scene." };
  async function photo(owner = userId) {
    const id = randomUUID();
    photoIds.push(id);
    const bytes = new Uint8Array(await sharp(source).webp().toBuffer());
    files.set(id, bytes);
    await db.insert(artcovrReferenceUploads).values({ id, clerkUserId: owner, artworkId: artwork.id, objectKey: id, uploadedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) });
    return { id, bytes };
  }
  async function order(selectedPreviewId?: string) {
    const id = randomUUID();
    await db.insert(artcovrOrders).values({ id, clerkUserId: userId, artworkId: artwork.id, artworkSlug: artwork.slug, idempotencyKey: id, amountCents: 3500, saleMode: "repeatable", licenseTerms: "test", includedCredits: 4, status: "paid", paidAt: new Date(), selectedPreviewId });
    await db.insert(artcovrCreditLedger).values({
      id: `credit-${id}`,
      clerkUserId: userId,
      accountKey: userId,
      orderId: id,
      entryType: "grant",
      amount: 4,
      reason: "Test purchase credit grant",
      sourceId: `checkout:test:${id}`,
    });
    return id;
  }
  async function cleanup() {
    await db.delete(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, userId));
    if (photoIds.length) await db.delete(artcovrReferenceUploads).where(inArray(artcovrReferenceUploads.id, photoIds));
    await db.delete(artcovrCreditLedger).where(eq(artcovrCreditLedger.accountKey, userId));
    await db.delete(artcovrOrders).where(eq(artcovrOrders.clerkUserId, userId));
  }
  return { userId, source, requests, files, io, input, photo, order, cleanup };
}

test("original, purchased preview, identity photo, follow-up, earlier version and reset deliver the selected image bytes", async () => {
  const f = await fixture();
  try {
    const first = await admitGeneration(f.input, f.io);
    await runGeneration(first, f.userId, f.io);
    assert.deepEqual(f.requests[0].images, [f.source]);
    const firstRow = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, first.id)))[0];
    assert.equal(firstRow.providerRequestId, "req_real_provider_header");
    const selectedBytes = f.files.get(firstRow.cleanObjectKey!)!;
    const purchaseId = await f.order(first.id);
    const photo = await f.photo();
    const second = await admitGeneration({ ...f.input, purchaseId, referenceUploadId: photo.id }, f.io);
    await runGeneration(second, f.userId, f.io);
    assert.deepEqual(f.requests[1].images, [selectedBytes, photo.bytes]);
    assert.match(f.requests[1].prompt, /likeness/);
    const secondRow = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, second.id)))[0];
    const followup = await admitGeneration({ ...f.input, purchaseId, referenceGenerationId: second.id, prompt: "Add silver rain while keeping the person." }, f.io);
    await runGeneration(followup, f.userId, f.io);
    assert.deepEqual(f.requests[2].images, [f.files.get(secondRow.cleanObjectKey!)]);
    const additionalPhoto = await f.photo();
    const earlier = await admitGeneration({ ...f.input, purchaseId, referenceGenerationId: second.id, referenceUploadId: additionalPhoto.id }, f.io);
    await runGeneration(earlier, f.userId, f.io);
    assert.deepEqual(f.requests[3].images, [f.files.get(secondRow.cleanObjectKey!), additionalPhoto.bytes]);
    assert.deepEqual(f.files.get(firstRow.cleanObjectKey!), selectedBytes, "editing must not mutate an earlier version");
    const reset = await admitGeneration({ ...f.input, purchaseId, referenceGenerationId: second.id, resetToBase: true }, f.io);
    await runGeneration(reset, f.userId, f.io);
    assert.deepEqual(f.requests[4].images, [f.source]);
    assert.equal(f.files.has(photo.id), false, "consumed identity photos are removed");
    assert.equal(f.files.has(additionalPhoto.id), false);
  } finally { await f.cleanup(); }
});

test("duplicate requests and workers produce one edit and one allowance charge", async () => {
  const f = await fixture();
  try {
    const input = { ...f.input, requestId: randomUUID() };
    const [a, b] = await Promise.all([admitGeneration(input, f.io), admitGeneration(input, f.io)]);
    assert.equal(a.id, b.id);
    await Promise.all([runGeneration(a, f.userId, f.io), runGeneration(b, f.userId, f.io), runGeneration(a, f.userId, f.io)]);
    const replay = await admitGeneration(input, f.io);
    await runGeneration(replay, f.userId, f.io);
    assert.equal(f.requests.length, 1);
    const rows = await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, f.userId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].allowanceSlot, 1);
    await assert.rejects(admitGeneration({ ...input, prompt: "A different request" }, f.io), { code: "generation_request_conflict" });
  } finally { await f.cleanup(); }
});

test("concurrent request-ID reuse across purchases rejects the conflicting edit without a second charge", async () => {
  const f = await fixture();
  try {
    const purchaseA = await f.order();
    const purchaseB = await f.order();
    const requestId = randomUUID();
    const results = await Promise.allSettled([
      admitGeneration({ ...f.input, purchaseId: purchaseA, requestId }, f.io),
      admitGeneration({ ...f.input, purchaseId: purchaseB, requestId }, f.io),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal(rejected.reason.code, "generation_request_conflict");
    assert.equal((await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, f.userId))).length, 1);
  } finally { await f.cleanup(); }
});

test("missing sources and another person's photo cannot consume an allowance", async () => {
  const f = await fixture();
  try {
    const photo = await f.photo("another-owner");
    await assert.rejects(admitGeneration({ ...f.input, referenceUploadId: photo.id }, f.io), { code: "reference_upload_unresolved" });
    const ownedPhoto = await f.photo();
    f.files.delete("original.jpg");
    await assert.rejects(admitGeneration({ ...f.input, referenceUploadId: ownedPhoto.id }, f.io), { code: "generation_source_unavailable" });
    const upload = (await db.select().from(artcovrReferenceUploads).where(eq(artcovrReferenceUploads.id, ownedPhoto.id)))[0];
    assert.equal(upload.consumedAt, null, "missing artwork must not consume the customer's uploaded photo");
    assert.equal((await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, f.userId))).length, 0);
    assert.equal(f.requests.length, 0);
  } finally { await f.cleanup(); }
});

test("foreign results, foreign purchases and results from another purchase are rejected before charging", async () => {
  const f = await fixture();
  const foreign = await fixture();
  try {
    const foreignResult = await admitGeneration(foreign.input, foreign.io);
    await runGeneration(foreignResult, foreign.userId, foreign.io);
    const foreignOrder = await foreign.order(foreignResult.id);
    await assert.rejects(admitGeneration({ ...f.input, referenceGenerationId: foreignResult.id }, f.io), { code: "generation_not_found" });
    await assert.rejects(generationStatus(foreignResult.id, f.userId), { code: "generation_not_found" });
    await assert.rejects(admitGeneration({ ...f.input, purchaseId: foreignOrder }, f.io), { code: "purchase_not_entitled" });
    assert.equal(f.requests.length, 0);

    const purchaseA = await f.order();
    const purchaseB = await f.order();
    const purchasedResult = await admitGeneration({ ...f.input, purchaseId: purchaseA }, f.io);
    await runGeneration(purchasedResult, f.userId, f.io);
    await assert.rejects(admitGeneration({ ...f.input, purchaseId: purchaseB, referenceGenerationId: purchasedResult.id }, f.io), { code: "purchase_reference_mismatch" });
    await assert.rejects(admitGeneration({ ...f.input, referenceGenerationId: purchasedResult.id }, f.io), { code: "preview_cannot_reference_purchased_result" });
    const rows = await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.clerkUserId, f.userId));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].purchaseId, purchaseA);
    assert.equal(rows[0].allowanceSlot, 1);
  } finally { await f.cleanup(); await foreign.cleanup(); }
});

test("an unselected preview cannot replace the purchased preview", async () => {
  const f = await fixture();
  try {
    const selected = await admitGeneration(f.input, f.io);
    await runGeneration(selected, f.userId, f.io);
    const other = await admitGeneration({ ...f.input, prompt: "A different preview" }, f.io);
    await runGeneration(other, f.userId, f.io);
    const purchaseId = await f.order(selected.id);
    await assert.rejects(admitGeneration({ ...f.input, purchaseId, referenceGenerationId: other.id }, f.io), { code: "reference_is_not_selected_preview" });
    const rows = await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.purchaseId, purchaseId));
    assert.equal(rows.length, 0);
  } finally { await f.cleanup(); }
});

test("provider timeout releases allowance; expired workers cannot publish late results", async () => {
  const f = await fixture();
  try {
    const job = await admitGeneration(f.input, f.io);
    await runGeneration(job, f.userId, { ...f.io, createImageEditResult: async () => { const error = new Error("Timed out"); error.name = "APIConnectionTimeoutError"; throw error; } });
    const status = await generationStatus(job.id, f.userId);
    assert.equal(status.status, "timed_out");
    const failed = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, job.id)))[0];
    assert.equal(failed.allowanceSlot, null);
    const next = await admitGeneration(f.input, f.io);
    const retried = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, next.id)))[0];
    assert.equal(retried.allowanceSlot, 1);
    await db.update(artcovrGenerations).set({ createdAt: new Date(Date.now() - 6 * 60_000) }).where(eq(artcovrGenerations.id, next.id));
    assert.equal((await generationStatus(next.id, f.userId)).status, "timed_out");
    await runGeneration(next, f.userId, f.io);
    assert.equal(f.requests.length, 0);
  } finally { await f.cleanup(); }
});

test("the provider adapter's timeout error is recorded as timed_out and releases the allowance", async () => {
  const f = await fixture();
  try {
    const job = await admitGeneration(f.input, f.io);
    await runGeneration(job, f.userId, { ...f.io, createImageEditResult: async () => {
      throw new ImageProviderError("provider_timeout", "The image editing provider timed out.");
    } });
    const row = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, job.id)))[0];
    assert.equal(row.status, "timed_out");
    assert.equal(row.errorCode, "provider_timeout");
    assert.equal(row.allowanceSlot, null);
    assert.equal(row.cleanObjectKey, null);
  } finally { await f.cleanup(); }
});

test("a provider success arriving after expiry is discarded and cannot consume an allowance", { timeout: 15_000 }, async () => {
  const f = await fixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const providerStarted = new Promise<void>((resolve) => { started = resolve; });
  let running: Promise<void> | undefined;
  try {
    const job = await admitGeneration(f.input, f.io);
    running = runGeneration(job, f.userId, { ...f.io, createImageEditResult: async (source, prompt, size, photo, contentType) => {
      started();
      await held;
      return f.io.createImageEditResult(source, prompt, size, photo, contentType);
    } });
    await providerStarted;
    await db.update(artcovrGenerations).set({ createdAt: new Date(Date.now() - 6 * 60_000) }).where(eq(artcovrGenerations.id, job.id));
    assert.equal((await generationStatus(job.id, f.userId)).status, "timed_out");
    release();
    await running;
    const row = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, job.id)))[0];
    assert.equal(row.status, "timed_out");
    assert.equal(row.allowanceSlot, null);
    assert.equal(row.cleanObjectKey, null);
    assert.equal(row.previewObjectKey, null);
    assert.equal(f.requests.length, 1, "the late provider actually returned a result");
    assert.equal([...f.files.keys()].some((key) => key.startsWith("generated/")), false, "late outputs must be removed");
  } finally { release(); await running; await f.cleanup(); }
});

test("failed output storage removes partial results and releases the reserved allowance", async () => {
  const f = await fixture();
  try {
    const photo = await f.photo();
    const job = await admitGeneration({ ...f.input, referenceUploadId: photo.id }, f.io);
    await runGeneration(job, f.userId, { ...f.io, uploadPrivate: async (key, bytes) => {
      if (key.includes("preview-watermarked")) throw new Error("Storage unavailable");
      return f.io.uploadPrivate(key, bytes);
    } });
    const row = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, job.id)))[0];
    assert.equal(row.status, "failed");
    assert.equal(row.allowanceSlot, null);
    assert.equal(row.cleanObjectKey, null);
    assert.equal([...f.files.keys()].some((key) => key.startsWith("generated/")), false);
    assert.equal(f.files.has(photo.id), false);
    const next = await admitGeneration(f.input, f.io);
    const retried = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, next.id)))[0];
    assert.equal(retried.allowanceSlot, 1);
  } finally { await f.cleanup(); }
});

test("photo cleanup failure preserves a successful edit and the record needed to retry cleanup", async () => {
  const f = await fixture();
  try {
    const photo = await f.photo();
    const job = await admitGeneration({ ...f.input, referenceUploadId: photo.id }, f.io);
    await runGeneration(job, f.userId, { ...f.io, removePrivate: async (keys) => {
      if (keys.includes(photo.id)) throw new Error("Storage cleanup temporarily unavailable");
      return f.io.removePrivate(keys);
    } });
    const row = (await db.select().from(artcovrGenerations).where(eq(artcovrGenerations.id, job.id)))[0];
    assert.equal(row.status, "succeeded");
    assert.equal(row.allowanceSlot, 1);
    assert.ok(row.cleanObjectKey && f.files.has(row.cleanObjectKey));
    assert.ok(row.previewObjectKey && f.files.has(row.previewObjectKey));
    assert.equal(f.files.has(photo.id), true);
    const references = await db.select().from(artcovrReferenceUploads).where(eq(artcovrReferenceUploads.id, photo.id));
    assert.equal(references.length, 1, "retain metadata so the private photo is not orphaned after a deletion failure");
  } finally { await f.cleanup(); }
});

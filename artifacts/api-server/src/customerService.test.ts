import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { artcovrGenerations, db } from "@workspace/db";
import { GenerationServiceError, generationStatus } from "./generationService";
import { ImagePipelineError, inspectReference } from "./lib/imagePipeline";

test("reference validation decodes and normalizes supported still images", async () => {
  const bytes = await sharp({
    create: { width: 320, height: 320, channels: 3, background: { r: 30, g: 90, b: 160 } },
  }).png().toBuffer();
  const normalized = await inspectReference(new Uint8Array(bytes), "image/png");
  assert.equal(normalized.width, 320);
  assert.equal(normalized.height, 320);
  assert.ok(normalized.sha256.match(/^[0-9a-f]{64}$/));
  assert.ok(normalized.bytes.length > 0);
});

test("reference validation rejects a declared type that does not match image bytes", async () => {
  const bytes = await sharp({
    create: { width: 320, height: 320, channels: 3, background: "white" },
  }).jpeg().toBuffer();
  await assert.rejects(
    inspectReference(new Uint8Array(bytes), "image/png"),
    (error: unknown) => error instanceof ImagePipelineError && error.code === "reference_type_mismatch",
  );
});

test("generation status never reveals another account's generation", async () => {
  const id = randomUUID();
  await db.insert(artcovrGenerations).values({
    id,
    artworkId: "isolation-test-artwork",
    clerkUserId: "customer-owner",
    phase: "preview",
    status: "queued",
    prompt: "test",
    sourceObjectKey: "test/source",
    expiresAt: new Date(Date.now() + 60_000),
  });
  try {
    await assert.rejects(
      generationStatus(id, "different-customer"),
      (error: unknown) => error instanceof GenerationServiceError && error.status === 404 && error.code === "generation_not_found",
    );
    const own = await generationStatus(id, "customer-owner");
    assert.equal(own.generationId, id);
    assert.equal(own.status, "queued");
  } finally {
    await db.delete(artcovrGenerations).where(eq(artcovrGenerations.id, id));
  }
});
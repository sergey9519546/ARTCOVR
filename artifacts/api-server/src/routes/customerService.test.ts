import assert from "node:assert/strict";
import test from "node:test";
import { GenerationServiceError } from "../generationService";
import { ImagePipelineError } from "../lib/imagePipeline";
import { rollbackReferenceUpload, sendCustomerServiceError } from "./customerService";

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.payload = payload; return this; },
  };
}

test("customer routes expose only allowlisted application errors", () => {
  for (const [error, status] of [
    [new GenerationServiceError(403, "purchase_not_entitled", "That purchase does not grant active generation access."), 403],
    [new ImagePipelineError("reference_type_mismatch", "The file contents do not match its declared type."), 400],
  ] as const) {
    const response = responseRecorder();
    sendCustomerServiceError(response as never, error);
    assert.equal(response.statusCode, status);
    assert.deepEqual(response.payload, { code: error.code, message: error.message });
  }
});

test("string-coded infrastructure errors cannot disclose raw provider or database details", () => {
  for (const error of [
    Object.assign(new Error("private database host and fake-secret-do-not-echo"), { code: "28P01" }),
    Object.assign(new Error("private storage path and fake-secret-do-not-echo"), { code: "ECONNRESET" }),
    { code: "reference_type_mismatch", message: "fake-secret-do-not-echo" },
    new Error("fake-secret-do-not-echo"),
  ]) {
    const response = responseRecorder();
    sendCustomerServiceError(response as never, error);
    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.payload, {
      code: "service_unavailable",
      message: "The customer service is temporarily unavailable.",
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /fake-secret|private storage|private database/);
  }
});

test("failed object deletion preserves personal-photo tracking metadata", async () => {
  const id = "reference-deletion-failure";
  const objectKey = "reference-uploads/test/photo.webp";
  const objects = new Set([objectKey]);
  const records = new Map([[id, objectKey]]);
  let recordDeletionAttempts = 0;
  await rollbackReferenceUpload(id, objectKey, {
    removePrivate: async (keys) => {
      assert.deepEqual(keys, [objectKey]);
      throw new Error("storage unavailable");
    },
    removeRecord: async (referenceId) => {
      recordDeletionAttempts += 1;
      records.delete(referenceId);
    },
  });
  assert.equal(recordDeletionAttempts, 0);
  assert.equal(records.get(id), objectKey);
  assert.equal(objects.has(objectKey), true);
});

test("successful rollback removes the photo before deleting its tracking record", async () => {
  const id = "reference-deletion-success";
  const objectKey = "reference-uploads/test/photo.webp";
  const objects = new Set([objectKey]);
  const records = new Map([[id, objectKey]]);
  await rollbackReferenceUpload(id, objectKey, {
    removePrivate: async (keys) => {
      assert.deepEqual(keys, [objectKey]);
      assert.equal(records.get(id), objectKey);
      objects.delete(objectKey);
    },
    removeRecord: async (referenceId) => {
      assert.equal(objects.has(objectKey), false);
      records.delete(referenceId);
    },
  });
  assert.equal(records.has(id), false);
  assert.equal(objects.has(objectKey), false);
});

test("metadata deletion failure does not replace the original upload error", async () => {
  let objectDeleted = false;
  await assert.doesNotReject(rollbackReferenceUpload("reference-db-outage", "reference-uploads/test/photo.webp", {
    removePrivate: async () => { objectDeleted = true; },
    removeRecord: async () => { throw new Error("database unavailable"); },
  }));
  assert.equal(objectDeleted, true);
});

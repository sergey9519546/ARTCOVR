import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeImageHeader,
  decodeJpegHeader,
  decodePngHeader,
  makeCatalogSlug,
  validateCandidateMetadata,
} from "../../src/lib/artcovr/catalog-source.ts";

function minimalPngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 2;
  return bytes;
}

function minimalJpegHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(15);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = 1;
  bytes.set([1, 0x11, 0], 12);
  return bytes;
}

test("reads square PNG dimensions from an IHDR header", () => {
  assert.deepEqual(decodePngHeader(minimalPngHeader(1254, 1254)), {
    width: 1254,
    height: 1254,
    bitDepth: 8,
    colorType: 2,
  });
});

test("rejects an invalid or truncated PNG header", () => {
  assert.throws(() => decodePngHeader(Buffer.from("not a png")), /PNG/);
});

test("reads dimensions from JPEG content even when a source filename is mislabeled", () => {
  assert.deepEqual(decodeJpegHeader(minimalJpegHeader(1254, 1254)), {
    width: 1254,
    height: 1254,
  });
  assert.deepEqual(decodeImageHeader(minimalJpegHeader(2048, 2048)), {
    format: "jpeg",
    width: 2048,
    height: 2048,
  });
});

test("normalizes human titles into stable catalog slugs", () => {
  assert.equal(makeCatalogSlug("  Ethereal Cloud — Surrealism  "), "ethereal-cloud-surrealism");
});

test("marks non-square, undersized, zero-byte, and duplicate candidates invalid", () => {
  const issues = validateCandidateMetadata(
    [
      { id: "a", width: 1024, height: 1024, bytes: 20, sha256: "a".repeat(64) },
      { id: "b", width: 1024, height: 768, bytes: 20, sha256: "b".repeat(64) },
      { id: "c", width: 512, height: 512, bytes: 20, sha256: "c".repeat(64) },
      { id: "d", width: 1024, height: 1024, bytes: 0, sha256: "d".repeat(64) },
      { id: "e", width: 1024, height: 1024, bytes: 20, sha256: "a".repeat(64) },
    ],
  );

  assert.deepEqual(
    issues.map(({ id, code }) => `${id}:${code}`),
    ["b:NOT_SQUARE", "c:TOO_SMALL", "d:ZERO_BYTES", "e:DUPLICATE_SHA256"],
  );
});

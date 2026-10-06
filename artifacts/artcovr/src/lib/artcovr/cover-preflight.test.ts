import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCoverArtwork,
  type CoverPlatform,
  type CoverPreflightCheck,
} from "./cover-preflight";

function u32(value: number) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function pngChunk(name: string, data: number[] = []) {
  return new Uint8Array([
    ...u32(data.length),
    ...name.split("").map((character) => character.charCodeAt(0)),
    ...data,
    0, 0, 0, 0,
  ]);
}

function png(
  width: number,
  height: number,
  options: { icc?: boolean; exifOrientation?: boolean; colorType?: number } = {},
) {
  const header = [
    ...u32(width),
    ...u32(height),
    8,
    options.colorType ?? 2,
    0, 0, 0,
  ];
  const chunks = [
    pngChunk("IHDR", header),
    ...(options.icc ? [pngChunk("iCCP", [0, 0])] : []),
    ...(options.exifOrientation ? [pngChunk("eXIf", littleEndianExifOrientation())] : []),
    pngChunk("IDAT"),
    pngChunk("IEND"),
  ];
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunks.flatMap((chunk) => [...chunk]),
  ]);
}

function littleEndianExifOrientation() {
  return [
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00,
    0x01, 0x00, 0x00, 0x00,
    0x06, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ];
}

function jpegSegment(marker: number, data: number[]) {
  const length = data.length + 2;
  return [0xff, marker, (length >>> 8) & 0xff, length & 0xff, ...data];
}

function jpeg(width: number, height: number, options: { icc?: boolean; orientation?: boolean } = {}) {
  const exif = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ...littleEndianExifOrientation(),
  ];
  return new Uint8Array([
    0xff, 0xd8,
    ...(options.orientation ? jpegSegment(0xe1, exif) : []),
    ...(options.icc
      ? jpegSegment(0xe2, [
          ...new TextEncoder().encode("ICC_PROFILE\u0000"),
          1, 1, 0,
        ])
      : []),
    ...jpegSegment(0xc0, [
      8,
      (height >>> 8) & 0xff, height & 0xff,
      (width >>> 8) & 0xff, width & 0xff,
      3,
    ]),
    0xff, 0xd9,
  ]);
}

function gif(width: number, height: number) {
  return new Uint8Array([
    ...new TextEncoder().encode("GIF89a"),
    width & 0xff, (width >>> 8) & 0xff,
    height & 0xff, (height >>> 8) & 0xff,
  ]);
}

function checkFor(
  bytes: Uint8Array,
  platform: CoverPlatform,
  declaredType = "",
): CoverPreflightCheck[] {
  const result = checkCoverArtwork(bytes, [platform], declaredType);
  return result.results[0].checks;
}

function byId(checks: CoverPreflightCheck[], id: string) {
  const found = checks.find((item) => item.id === id);
  assert.ok(found, `Missing ${id} check`);
  return found;
}

test("Spotify dimensions include both published boundaries", () => {
  assert.equal(byId(checkFor(png(640, 640), "spotify"), "dimensions").status, "pass");
  assert.equal(byId(checkFor(png(10_000, 10_000), "spotify"), "dimensions").status, "pass");
  assert.equal(byId(checkFor(png(639, 639), "spotify"), "dimensions").status, "issue");
  assert.equal(byId(checkFor(png(10_001, 10_001), "spotify"), "dimensions").status, "issue");
});

test("Apple Music minimum is inclusive and does not invent a maximum", () => {
  assert.equal(byId(checkFor(png(4_000, 4_000), "apple-music"), "dimensions").status, "pass");
  assert.equal(byId(checkFor(png(3_999, 4_000), "apple-music"), "dimensions").status, "issue");
  assert.equal(byId(checkFor(png(20_000, 20_000), "apple-music"), "dimensions").status, "pass");
});

test("square shape is reported separately from pixel dimensions", () => {
  const spotifyChecks = checkFor(png(4_000, 3_999), "spotify");
  assert.equal(byId(spotifyChecks, "shape").status, "issue");
  assert.equal(byId(spotifyChecks, "dimensions").status, "pass");

  const appleChecks = checkFor(png(4_000, 3_999), "apple-music");
  assert.equal(byId(appleChecks, "shape").status, "issue");
  assert.equal(byId(appleChecks, "dimensions").status, "issue");
});

test("platform format lists differ and are based on file contents", () => {
  assert.equal(byId(checkFor(jpeg(4_000, 4_000), "spotify", "image/jpeg"), "format").status, "pass");
  assert.equal(byId(checkFor(png(4_000, 4_000), "apple-music", "image/png"), "format").status, "pass");
  assert.equal(byId(checkFor(gif(4_000, 4_000), "apple-music", "image/gif"), "format").status, "pass");
  assert.equal(byId(checkFor(gif(4_000, 4_000), "spotify", "image/gif"), "format").status, "issue");
  assert.equal(byId(checkFor(new Uint8Array([0x49, 0x49, 0x2a, 0x00]), "spotify"), "format").status, "pass");
  assert.equal(byId(checkFor(new Uint8Array([0x49, 0x49, 0x2a, 0x00]), "apple-music"), "format").status, "issue");
  assert.equal(byId(checkFor(png(4_000, 4_000), "spotify", "image/jpeg"), "format").status, "issue");
});

test("missing color metadata is review, not a claim that Spotify will accept the file", () => {
  const checks = checkFor(png(4_000, 4_000), "spotify");
  const color = byId(checks, "color-space");
  assert.equal(color.status, "review");
  assert.match(color.detail, /cannot prove that the pixel values are sRGB/i);
  assert.match(color.correction ?? "", /sRGB directly/i);
  assert.equal(byId(checks, "color-profile").status, "pass");
  assert.equal(byId(checks, "orientation-metadata").status, "pass");
});

test("unsupported color and orientation metadata are called out for Spotify", () => {
  const profile = byId(
    checkFor(png(4_000, 4_000, { icc: true }), "spotify"),
    "color-profile",
  );
  assert.equal(profile.status, "issue");
  assert.match(profile.detail, /embedded ICC profile/i);

  const orientation = byId(
    checkFor(jpeg(4_000, 4_000, { orientation: true }), "spotify", "image/jpeg"),
    "orientation-metadata",
  );
  assert.equal(orientation.status, "issue");
  assert.match(orientation.detail, /orientation tag/i);
});

test("non-24-bit and non-RGB image modes are not reported as Spotify passes", () => {
  const alpha = byId(
    checkFor(png(4_000, 4_000, { colorType: 6 }), "spotify"),
    "color-space",
  );
  assert.equal(alpha.status, "issue");
  assert.match(alpha.detail, /32 bits per pixel/);

  const grayscale = byId(
    checkFor(png(4_000, 4_000, { colorType: 0 }), "spotify"),
    "color-space",
  );
  assert.equal(grayscale.status, "issue");
  assert.match(grayscale.detail, /not RGB/);
});

test("Apple reports that its cited guide does not specify color metadata rules", () => {
  const metadata = byId(checkFor(png(4_000, 4_000), "apple-music"), "color-metadata");
  assert.equal(metadata.status, "info");
  assert.match(metadata.detail, /does not specify/i);
});

test("unrecognized or damaged input is not silently treated as valid artwork", () => {
  const checks = checkFor(new Uint8Array([1, 2, 3]), "spotify");
  assert.equal(byId(checks, "format").status, "issue");
  assert.equal(byId(checks, "dimensions").status, "issue");
  assert.equal(byId(checks, "shape").status, "issue");
});

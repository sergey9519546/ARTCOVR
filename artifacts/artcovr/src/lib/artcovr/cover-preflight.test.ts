import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkCoverArtwork,
  type CoverPlatform,
  type CoverPreflightCheck,
} from "./cover-preflight";
import { ANSWER_GUIDES } from "./answer-guides";
import {
  COVER_ART_GUIDANCE_REVIEWED_ON,
  COVER_ART_PLATFORM_REQUIREMENTS,
  type CoverArtImageFormat,
  describeCoverArtDimensions,
  formatCoverArtFormats,
} from "./cover-art-platform-requirements";

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
    0,
    0,
    0,
    0,
  ]);
}

function png(
  width: number,
  height: number,
  options: {
    icc?: boolean;
    exifOrientation?: boolean;
    colorType?: number;
  } = {},
) {
  const header = [
    ...u32(width),
    ...u32(height),
    8,
    options.colorType ?? 2,
    0,
    0,
    0,
  ];
  const chunks = [
    pngChunk("IHDR", header),
    ...(options.icc ? [pngChunk("iCCP", [0, 0])] : []),
    ...(options.exifOrientation
      ? [pngChunk("eXIf", littleEndianExifOrientation())]
      : []),
    pngChunk("IDAT"),
    pngChunk("IEND"),
  ];
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunks.flatMap((chunk) => [...chunk]),
  ]);
}

function littleEndianExifOrientation() {
  return [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01,
    0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
  ];
}

function jpegSegment(marker: number, data: number[]) {
  const length = data.length + 2;
  return [0xff, marker, (length >>> 8) & 0xff, length & 0xff, ...data];
}

function jpeg(
  width: number,
  height: number,
  options: { icc?: boolean; orientation?: boolean } = {},
) {
  const exif = [
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
    ...littleEndianExifOrientation(),
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...(options.orientation ? jpegSegment(0xe1, exif) : []),
    ...(options.icc
      ? jpegSegment(0xe2, [
          ...new TextEncoder().encode("ICC_PROFILE\u0000"),
          1,
          1,
          0,
        ])
      : []),
    ...jpegSegment(0xc0, [
      8,
      (height >>> 8) & 0xff,
      height & 0xff,
      (width >>> 8) & 0xff,
      width & 0xff,
      3,
    ]),
    0xff,
    0xd9,
  ]);
}

function gif(width: number, height: number) {
  return new Uint8Array([
    ...new TextEncoder().encode("GIF89a"),
    width & 0xff,
    (width >>> 8) & 0xff,
    height & 0xff,
    (height >>> 8) & 0xff,
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

function editorFixture(filename: string) {
  return new Uint8Array(
    readFileSync(
      new URL(
        `../../../tests/fixtures/cover-preflight/${filename}`,
        import.meta.url,
      ),
    ),
  );
}

test("Spotify dimensions include both published boundaries", () => {
  const requirements = COVER_ART_PLATFORM_REQUIREMENTS.spotify;
  const min = requirements.minimumDimension;
  const max = requirements.maximumDimension;
  assert.notEqual(
    max,
    null,
    "Spotify's published requirements include a maximum.",
  );
  if (max === null)
    throw new Error("Spotify's maximum dimension must be specified.");
  assert.equal(
    byId(checkFor(png(min, min), "spotify"), "dimensions").status,
    "pass",
  );
  assert.equal(
    byId(checkFor(png(max, max), "spotify"), "dimensions").status,
    "pass",
  );
  assert.equal(
    byId(checkFor(png(min - 1, min - 1), "spotify"), "dimensions").status,
    "issue",
  );
  assert.equal(
    byId(checkFor(png(max + 1, max + 1), "spotify"), "dimensions").status,
    "issue",
  );
});

test("Apple Music minimum is inclusive and does not invent a maximum", () => {
  const requirements = COVER_ART_PLATFORM_REQUIREMENTS["apple-music"];
  const min = requirements.minimumDimension;
  assert.equal(
    requirements.maximumDimension,
    null,
    "Do not invent an Apple Music maximum absent from its cited requirements.",
  );
  assert.equal(
    byId(checkFor(png(min, min), "apple-music"), "dimensions").status,
    "pass",
  );
  assert.equal(
    byId(checkFor(png(min - 1, min), "apple-music"), "dimensions").status,
    "issue",
  );
  assert.equal(
    byId(checkFor(png(20_000, 20_000), "apple-music"), "dimensions").status,
    "pass",
  );
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
  const samples: Record<CoverArtImageFormat, Uint8Array> = {
    JPEG: jpeg(4_000, 4_000),
    PNG: png(4_000, 4_000),
    TIFF: new Uint8Array([0x49, 0x49, 0x2a, 0x00]),
    GIF: gif(4_000, 4_000),
    WEBP: new Uint8Array([
      ...new TextEncoder().encode("RIFF"),
      0,
      0,
      0,
      0,
      ...new TextEncoder().encode("WEBP"),
    ]),
  };
  const mimeTypes: Record<CoverArtImageFormat, string> = {
    JPEG: "image/jpeg",
    PNG: "image/png",
    TIFF: "image/tiff",
    GIF: "image/gif",
    WEBP: "image/webp",
  };

  for (const platform of ["spotify", "apple-music"] as const) {
    const requirements = COVER_ART_PLATFORM_REQUIREMENTS[platform];
    for (const format of Object.keys(samples) as CoverArtImageFormat[]) {
      const result = byId(
        checkFor(samples[format], platform, mimeTypes[format]),
        "format",
      );
      const allowed = requirements.formats.includes(format);
      assert.equal(
        result.status,
        allowed ? "pass" : "issue",
        `${platform} eligibility for ${format} must follow the shared format list.`,
      );
      if (allowed && requirements.losslessEncoding) {
        assert.match(
          result.detail,
          /cannot verify lossless encoding/i,
          `${platform} preflight must not claim that it verified lossless encoding.`,
        );
      }
    }
  }

  assert.equal(
    byId(checkFor(png(4_000, 4_000), "spotify", "image/jpeg"), "format").status,
    "issue",
    "The browser MIME type must agree with the detected file format.",
  );
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
    checkFor(
      jpeg(4_000, 4_000, { orientation: true }),
      "spotify",
      "image/jpeg",
    ),
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
  const metadata = byId(
    checkFor(png(4_000, 4_000), "apple-music"),
    "color-metadata",
  );
  assert.equal(metadata.status, "info");
  assert.match(metadata.detail, /does not specify/i);
});

test("unrecognized or damaged input is not silently treated as valid artwork", () => {
  const checks = checkFor(new Uint8Array([1, 2, 3]), "spotify");
  assert.equal(byId(checks, "format").status, "issue");
  assert.equal(byId(checks, "file-integrity").status, "review");
  assert.equal(byId(checks, "dimensions").status, "issue");
  assert.equal(byId(checks, "shape").status, "issue");
});

test("editor-exported JPEG, PNG, and big-endian TIFF metadata is detected", () => {
  const fixtures = [
    {
      filename: "image-editor-profile-orientation.jpg",
      type: "image/jpeg",
      format: "JPEG",
      width: 48,
      height: 32,
    },
    {
      filename: "image-editor-profile-orientation.png",
      type: "image/png",
      format: "PNG",
      width: 36,
      height: 36,
    },
    {
      filename: "image-editor-big-endian.tif",
      type: "image/tiff",
      format: "TIFF",
      width: 48,
      height: 32,
    },
  ];

  for (const fixture of fixtures) {
    const result = checkCoverArtwork(
      editorFixture(fixture.filename),
      ["spotify"],
      fixture.type,
    );
    assert.equal(result.format, fixture.format, fixture.filename);
    assert.equal(result.width, fixture.width, fixture.filename);
    assert.equal(result.height, fixture.height, fixture.filename);
    assert.equal(
      byId(result.results[0].checks, "file-integrity").status,
      "pass",
      fixture.filename,
    );
    assert.equal(
      byId(result.results[0].checks, "color-profile").status,
      "issue",
      fixture.filename,
    );
    assert.equal(
      byId(result.results[0].checks, "orientation-metadata").status,
      "issue",
      fixture.filename,
    );
  }
});

test("the public guide and local preflight share cited platform requirements", () => {
  const guide = ANSWER_GUIDES.find(
    (item) =>
      item.path === "/guides/spotify-apple-music-cover-art-requirements",
  );
  assert.ok(
    guide,
    "The Spotify and Apple Music requirements guide must exist.",
  );
  assert.equal(
    guide.lastReviewed,
    COVER_ART_GUIDANCE_REVIEWED_ON,
    "The public guide review date must come from the shared requirements source.",
  );

  const comparison = guide.sections.find(
    (section) => section.comparison,
  )?.comparison;
  assert.ok(
    comparison,
    "The requirements guide must publish its platform comparison.",
  );
  const rows = new Map(
    comparison.rows.map(([heading, spotify, apple]) => [
      heading,
      [spotify, apple],
    ]),
  );
  const spotify = COVER_ART_PLATFORM_REQUIREMENTS.spotify;
  const apple = COVER_ART_PLATFORM_REQUIREMENTS["apple-music"];
  const spotifyColorSummary = spotify.color
    ? `${spotify.color.colorSpace} at ${spotify.color.bitsPerPixel} bits per pixel; ${
        spotify.color.profilePlacement === "applied-to-values"
          ? "color profile applied directly"
          : `color profile ${spotify.color.profilePlacement}`
      }`
    : "color guidance not stated on the cited cover-art page";
  const appleColorSummary = apple.color
    ? `${apple.color.colorSpace}, ${apple.color.bitsPerPixel} bits per pixel`
    : "Not stated on the cited cover-art page";
  const expectedSpotifyColor = spotify.color
    ? spotifyColorSummary
    : "Not stated on the cited cover-art page";
  assert.deepEqual(
    rows.get("Dimensions"),
    [
      describeCoverArtDimensions(spotify),
      `At least ${apple.minimumDimension.toLocaleString("en-US")} × ${apple.minimumDimension.toLocaleString("en-US")} px`,
    ],
    "Guide dimension text must match the same limits enforced by the preflight.",
  );
  assert.deepEqual(
    rows.get("Formats"),
    [
      `${formatCoverArtFormats(spotify.formats)}${spotify.losslessEncoding ? "; lossless encoding" : ""}`,
      formatCoverArtFormats(apple.formats),
    ],
    "Guide format text must match the same accepted formats as the preflight.",
  );
  assert.deepEqual(
    rows.get("Color"),
    [expectedSpotifyColor, appleColorSummary],
    "Guide color and metadata text must track platform-published guidance.",
  );

  for (const requirements of [spotify, apple]) {
    const source = guide.sources.find(
      (item) => item.href === requirements.source.href,
    );
    assert.ok(
      source,
      `${requirements.label} official citation must remain visible in the guide.`,
    );
    assert.equal(source.title, requirements.source.title);
    assert.equal(source.publisher, requirements.source.publisher);
    const platform: CoverPlatform =
      requirements === spotify ? "spotify" : "apple-music";
    const dimensionCheck = byId(
      checkFor(
        png(requirements.minimumDimension, requirements.minimumDimension),
        platform,
      ),
      "dimensions",
    );
    assert.match(
      dimensionCheck.detail,
      new RegExp(
        describeCoverArtDimensions(requirements).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
      ),
      `${requirements.label} preflight dimensions must use the shared limits.`,
    );
  }

  const metadataAnswer = guide.sections.find(
    (section) =>
      section.heading ===
      "How can one export meet both published specifications?",
  );
  assert.ok(
    metadataAnswer,
    "The shared export guidance must remain in the guide.",
  );
  if (spotify.color) {
    assert.match(metadataAnswer.answer, new RegExp(spotify.color.colorSpace));
  } else {
    assert.match(metadataAnswer.answer, /follow the cited color guidance/i);
  }
  if (spotify.orientationMetadata === "avoid") {
    assert.match(metadataAnswer.answer, /avoid orientation metadata/i);
  }
  const appleMetadata = byId(
    checkFor(
      png(apple.minimumDimension, apple.minimumDimension),
      "apple-music",
    ),
    "color-metadata",
  );
  assert.match(
    appleMetadata.detail,
    new RegExp(apple.source.publisher),
    "Preflight metadata notes must retain Apple's cited source attribution.",
  );

  assert.match(
    guide.introduction,
    new RegExp(
      `${spotify.minimumDimension.toLocaleString("en-US")}.*${apple.minimumDimension.toLocaleString("en-US")}`,
    ),
    "The guide introduction must retain both platforms' current minimum sizes.",
  );
});

test("malformed editor exports are not passed based on dimensions alone", () => {
  for (const [filename, type] of [
    ["truncated.jpg", "image/jpeg"],
    ["truncated.png", "image/png"],
  ]) {
    const checks = checkFor(editorFixture(filename), "spotify", type);
    assert.equal(byId(checks, "dimensions").status, "issue", filename);
    assert.equal(byId(checks, "file-integrity").status, "issue", filename);
  }
});

test("animated GIFs are flagged and unsupported WebP is reported by name", () => {
  const gifChecks = checkFor(
    editorFixture("animated.gif"),
    "apple-music",
    "image/gif",
  );
  assert.equal(byId(gifChecks, "format").status, "pass");
  assert.equal(byId(gifChecks, "file-integrity").status, "pass");
  assert.equal(byId(gifChecks, "animation").status, "issue");

  const webpChecks = checkFor(
    editorFixture("unsupported.webp"),
    "spotify",
    "image/webp",
  );
  assert.equal(byId(webpChecks, "format").status, "issue");
  assert.match(byId(webpChecks, "format").detail, /WEBP is not listed/i);
  assert.equal(byId(webpChecks, "file-integrity").status, "pass");
});

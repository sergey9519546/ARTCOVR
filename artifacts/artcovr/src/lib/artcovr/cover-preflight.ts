export type CoverPlatform = "spotify" | "apple-music";
export type CoverCheckStatus = "pass" | "issue" | "review" | "info";

export type CoverPreflightCheck = {
  id: string;
  label: string;
  status: CoverCheckStatus;
  detail: string;
  correction?: string;
};

export type CoverPlatformResult = {
  platform: CoverPlatform;
  label: string;
  checks: CoverPreflightCheck[];
};

type ImageFormat = "JPEG" | "PNG" | "TIFF" | "GIF" | "WEBP" | "Unknown";
type ColorMode = "RGB" | "RGBA" | "Grayscale" | "Indexed" | "CMYK" | "Unknown";

type ImageMetadata = {
  format: ImageFormat;
  width?: number;
  height?: number;
  bitsPerPixel?: number;
  colorMode?: ColorMode;
  hasIccProfile: boolean;
  hasColorMetadata: boolean;
  hasOrientation: boolean;
};

const SPOTIFY_FORMATS = new Set<ImageFormat>(["JPEG", "PNG", "TIFF"]);
const APPLE_MUSIC_FORMATS = new Set<ImageFormat>(["JPEG", "PNG", "GIF"]);

function matches(bytes: Uint8Array, offset: number, values: number[]) {
  return values.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readTiffMetadata(
  bytes: Uint8Array,
  start: number,
  length: number,
): Partial<ImageMetadata> {
  const end = Math.min(bytes.length, start + length);
  if (start + 8 > end) return {};
  const byteOrder = readAscii(bytes, start, 2);
  if (byteOrder !== "II" && byteOrder !== "MM") return {};
  const littleEndian = byteOrder === "II";
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readU16 = (offset: number) =>
    offset + 2 <= end ? view.getUint16(offset, littleEndian) : undefined;
  const readU32 = (offset: number) =>
    offset + 4 <= end ? view.getUint32(offset, littleEndian) : undefined;
  if (readU16(start + 2) !== 42) return {};
  const ifdOffset = readU32(start + 4);
  if (ifdOffset === undefined) return {};
  const ifd = start + ifdOffset;
  const count = readU16(ifd);
  if (count === undefined || ifd + 2 + count * 12 > end) return {};

  const tags = new Map<number, { type: number; count: number; entry: number }>();
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    const tag = readU16(entry);
    const type = readU16(entry + 2);
    const itemCount = readU32(entry + 4);
    if (tag !== undefined && type !== undefined && itemCount !== undefined) {
      tags.set(tag, { type, count: itemCount, entry });
    }
  }

  const readTagNumbers = (tag: number) => {
    const value = tags.get(tag);
    if (!value || (value.type !== 3 && value.type !== 4)) return [];
    const itemSize = value.type === 3 ? 2 : 4;
    const byteCount = value.count * itemSize;
    const valueOffset =
      byteCount <= 4
        ? value.entry + 8
        : start + (readU32(value.entry + 8) ?? end - start);
    if (valueOffset < start || valueOffset + byteCount > end) return [];
    return Array.from({ length: value.count }, (_, index) =>
      value.type === 3
        ? (readU16(valueOffset + index * itemSize) ?? 0)
        : (readU32(valueOffset + index * itemSize) ?? 0),
    );
  };
  const first = (tag: number) => readTagNumbers(tag)[0];
  const width = first(256);
  const height = first(257);
  const bits = readTagNumbers(258);
  const photometric = first(262);
  const colorMode: ColorMode =
    photometric === 2
      ? "RGB"
      : photometric === 5
        ? "CMYK"
        : photometric === 3
          ? "Indexed"
          : photometric === 0 || photometric === 1
            ? "Grayscale"
            : "Unknown";

  return {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(bits.length ? { bitsPerPixel: bits.reduce((sum, bit) => sum + bit, 0) } : {}),
    ...(photometric !== undefined
      ? { colorMode }
      : {}),
    hasIccProfile: tags.has(34675),
    hasColorMetadata: tags.has(34675),
    hasOrientation: tags.has(274),
  };
}

function inspectTiff(bytes: Uint8Array): ImageMetadata {
  return {
    format: "TIFF",
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
    ...readTiffMetadata(bytes, 0, bytes.length),
  };
}

function inspectPng(bytes: Uint8Array): ImageMetadata {
  let width: number | undefined;
  let height: number | undefined;
  let bitsPerPixel: number | undefined;
  let colorMode: ColorMode | undefined;
  let hasIccProfile = false;
  let hasColorMetadata = false;
  let hasOrientation = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 8; offset + 12 <= bytes.length;) {
    const chunkLength = view.getUint32(offset);
    const chunkType = readAscii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    if (chunkLength > bytes.length - dataOffset - 4) break;
    if (chunkType === "IHDR" && chunkLength >= 13) {
      width = view.getUint32(dataOffset);
      height = view.getUint32(dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const channels =
        colorType === 0 ? 1 :
        colorType === 2 ? 3 :
        colorType === 3 ? 1 :
        colorType === 4 ? 2 :
        colorType === 6 ? 4 : 0;
      bitsPerPixel = bitDepth * channels;
      colorMode =
        colorType === 2 ? "RGB" :
        colorType === 6 ? "RGBA" :
        colorType === 3 ? "Indexed" :
        colorType === 0 || colorType === 4 ? "Grayscale" : "Unknown";
    } else if (chunkType === "iCCP") {
      hasIccProfile = true;
      hasColorMetadata = true;
    } else if (["sRGB", "gAMA", "cHRM", "cICP"].includes(chunkType)) {
      hasColorMetadata = true;
    } else if (chunkType === "eXIf") {
      const exif = readTiffMetadata(bytes, dataOffset, chunkLength);
      hasOrientation = Boolean(exif.hasOrientation);
    }
    offset = dataOffset + chunkLength + 4;
    if (chunkType === "IEND") break;
  }

  return {
    format: "PNG",
    width,
    height,
    bitsPerPixel,
    colorMode,
    hasIccProfile,
    hasColorMetadata,
    hasOrientation,
  };
}

function inspectJpeg(bytes: Uint8Array): ImageMetadata {
  let width: number | undefined;
  let height: number | undefined;
  let bitsPerPixel: number | undefined;
  let colorMode: ColorMode | undefined;
  let hasIccProfile = false;
  let hasOrientation = false;

  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const dataOffset = offset + 2;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const dataLength = segmentLength - 2;

    if (
      marker === 0xe2 &&
      dataLength >= 12 &&
      readAscii(bytes, dataOffset, 12) === "ICC_PROFILE\u0000"
    ) {
      hasIccProfile = true;
    } else if (
      marker === 0xe1 &&
      dataLength >= 6 &&
      readAscii(bytes, dataOffset, 6) === "Exif\u0000\u0000"
    ) {
      const exif = readTiffMetadata(
        bytes,
        dataOffset + 6,
        dataLength - 6,
      );
      hasOrientation = Boolean(exif.hasOrientation);
    } else if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && dataLength >= 6) {
      const precision = bytes[dataOffset];
      height = (bytes[dataOffset + 1] << 8) | bytes[dataOffset + 2];
      width = (bytes[dataOffset + 3] << 8) | bytes[dataOffset + 4];
      const components = bytes[dataOffset + 5];
      bitsPerPixel = precision * components;
      colorMode = components === 3 ? "RGB" : components === 4 ? "CMYK" : "Grayscale";
    }
    offset += segmentLength;
  }

  return {
    format: "JPEG",
    width,
    height,
    bitsPerPixel,
    colorMode,
    hasIccProfile,
    hasColorMetadata: hasIccProfile,
    hasOrientation,
  };
}

function inspectGif(bytes: Uint8Array): ImageMetadata {
  return {
    format: "GIF",
    width: bytes[6] | (bytes[7] << 8),
    height: bytes[8] | (bytes[9] << 8),
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
  };
}

function inspectImage(bytes: Uint8Array): ImageMetadata {
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return inspectJpeg(bytes);
  if (matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10])) return inspectPng(bytes);
  if (
    matches(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    matches(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  ) return inspectTiff(bytes);
  if (
    bytes.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(readAscii(bytes, 0, 6))
  ) return inspectGif(bytes);
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    return {
      format: "WEBP",
      hasIccProfile: false,
      hasColorMetadata: false,
      hasOrientation: false,
    };
  }
  return {
    format: "Unknown",
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
  };
}

function check(
  id: string,
  label: string,
  status: CoverCheckStatus,
  detail: string,
  correction?: string,
): CoverPreflightCheck {
  return { id, label, status, detail, ...(correction ? { correction } : {}) };
}

function checksForPlatform(
  metadata: ImageMetadata,
  platform: CoverPlatform,
  declaredType: string,
): CoverPreflightCheck[] {
  const spotify = platform === "spotify";
  const allowedFormats = spotify ? SPOTIFY_FORMATS : APPLE_MUSIC_FORMATS;
  const platformLabel = spotify ? "Spotify" : "Apple Music";
  const checks: CoverPreflightCheck[] = [];
  const fileTypeMismatch =
    declaredType &&
    metadata.format !== "Unknown" &&
    declaredType !== "application/octet-stream" &&
    !(
      (metadata.format === "JPEG" && ["image/jpeg", "image/jpg"].includes(declaredType)) ||
      (metadata.format === "PNG" && declaredType === "image/png") ||
      (metadata.format === "TIFF" && ["image/tiff", "image/tif"].includes(declaredType)) ||
      (metadata.format === "GIF" && declaredType === "image/gif") ||
      (metadata.format === "WEBP" && declaredType === "image/webp")
    );

  checks.push(
    metadata.format !== "Unknown" && allowedFormats.has(metadata.format) && !fileTypeMismatch
      ? check(
          "format",
          "File format",
          "pass",
          `${metadata.format} is listed in ${platformLabel}'s published cover-art formats.`,
        )
      : check(
          "format",
          "File format",
          "issue",
          metadata.format === "Unknown"
            ? "The selected bytes are not a file format this checker can identify."
            : fileTypeMismatch
              ? `The file content is ${metadata.format}, but the browser reports ${declaredType}.`
              : `${metadata.format} is not listed in ${platformLabel}'s published cover-art formats.`,
          metadata.format === "Unknown" || fileTypeMismatch
            ? "Choose the original JPG, PNG, TIFF, or GIF file and make sure its contents match its file type."
            : spotify
              ? "Export a JPG, PNG, or TIFF file."
              : "Export a JPG, PNG, or GIF file.",
        ),
  );

  if (!metadata.width || !metadata.height) {
    checks.push(
      check(
        "shape",
        "Square artwork",
        "issue",
        "The checker could not read valid pixel dimensions from this file.",
        "Re-export a valid still image and check that its width and height are equal.",
      ),
      check(
        "dimensions",
        "Pixel dimensions",
        "issue",
        "The checker could not read valid pixel dimensions from this file.",
        "Re-export a valid still image from your original artwork.",
      ),
    );
  } else {
    const square = metadata.width === metadata.height;
    checks.push(
      check(
        "shape",
        "Square artwork",
        square ? "pass" : "issue",
        square
          ? `The image is square (${metadata.width} × ${metadata.height} px).`
          : `The image is ${metadata.width} × ${metadata.height} px, not square.`,
        square ? undefined : "Crop or recompose the original artwork to a 1:1 square before exporting. This check will not crop it for you.",
      ),
    );

    const meetsDimensions = spotify
      ? metadata.width >= 640 &&
        metadata.width <= 10_000 &&
        metadata.height >= 640 &&
        metadata.height <= 10_000
      : metadata.width >= 4_000 && metadata.height >= 4_000;
    const requirement = spotify
      ? "640–10,000 px on each side"
      : "at least 4,000 px on each side";
    checks.push(
      check(
        "dimensions",
        "Pixel dimensions",
        meetsDimensions ? "pass" : "issue",
        `${metadata.width} × ${metadata.height} px; ${platformLabel} lists ${requirement}.`,
        meetsDimensions
          ? undefined
          : "Export from a sufficiently large original at the required size. Do not upscale a smaller file to meet the minimum.",
      ),
    );
  }

  if (spotify) {
    const colorProblems: string[] = [];
    if (metadata.colorMode && metadata.colorMode !== "RGB") {
      colorProblems.push(`the image is ${metadata.colorMode}, not RGB`);
    }
    if (metadata.bitsPerPixel !== undefined && metadata.bitsPerPixel !== 24) {
      colorProblems.push(`the image is ${metadata.bitsPerPixel} bits per pixel, not 24`);
    }
    checks.push(
      colorProblems.length
        ? check(
            "color-space",
            "Color space and depth",
            "issue",
            `Spotify's guidance calls for 24-bit RGB; ${colorProblems.join(" and ")}.`,
            "Export an RGB image at 24 bits per pixel and apply sRGB to the pixel values. This tool does not convert the image.",
          )
        : metadata.colorMode && metadata.bitsPerPixel !== undefined
          ? check(
              "color-space",
              "Color space and depth",
              "review",
              "RGB at 24 bits per pixel was detected. A byte check cannot prove that the pixel values are sRGB.",
              "Confirm that your export applied sRGB directly to the pixel values.",
            )
          : check(
              "color-space",
              "Color space and depth",
              "review",
              "The checker could not confirm both RGB color mode and 24-bit depth from this file.",
              "Verify the export settings with an image editor and confirm RGB, 24 bits per pixel, and sRGB applied to the pixel values.",
            ),
    );

    checks.push(
      metadata.hasIccProfile
        ? check(
            "color-profile",
            "Embedded color profile",
            "issue",
            "An embedded ICC profile was found. Spotify's cited guidance asks for the profile applied directly to the color values, not embedded in the file.",
            "Apply sRGB to the pixel values during export, then remove the embedded profile metadata.",
          )
        : metadata.hasColorMetadata
          ? check(
              "color-profile",
              "Embedded color profile",
              "review",
              "Color-related metadata was found, but no embedded ICC profile was detected. Confirm the export matches Spotify's current metadata rules.",
              "Check the final export's color settings and remove profile metadata if your delivery provider requires it.",
            )
          : check(
              "color-profile",
              "Embedded color profile",
              "pass",
              "No embedded ICC profile or color-profile metadata was detected.",
            ),
    );

    checks.push(
      metadata.hasOrientation
        ? check(
            "orientation-metadata",
            "Orientation metadata",
            "issue",
            "An orientation tag was found. The cited Spotify guidance says not to include orientation metadata.",
            "Apply the intended orientation to the pixels and export without the orientation tag.",
          )
        : check(
            "orientation-metadata",
            "Orientation metadata",
            "pass",
            "No orientation tag was detected.",
          ),
    );
  } else {
    checks.push(
      check(
        "color-metadata",
        "Color and orientation metadata",
        "info",
        "The cited Apple Music for Artists cover-art guidance does not specify a color-profile or orientation-metadata requirement. Check your distributor's current rules.",
      ),
    );
  }

  return checks;
}

export function checkCoverArtwork(
  bytes: Uint8Array,
  platforms: readonly CoverPlatform[],
  declaredType = "",
) {
  const metadata = inspectImage(bytes);
  return {
    format: metadata.format,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    results: platforms.map((platform) => ({
      platform,
      label: platform === "spotify" ? "Spotify" : "Apple Music",
      checks: checksForPlatform(metadata, platform, declaredType),
    })),
  };
}

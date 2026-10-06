import {
  COVER_ART_PLATFORM_REQUIREMENTS,
  describeCoverArtDimensions,
  formatCoverArtFormats,
} from "./cover-art-platform-requirements";

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
  isAnimated: boolean;
  isMalformed: boolean;
};

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

  const tags = new Map<
    number,
    { type: number; count: number; entry: number }
  >();
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
    ...(bits.length
      ? { bitsPerPixel: bits.reduce((sum, bit) => sum + bit, 0) }
      : {}),
    ...(photometric !== undefined ? { colorMode } : {}),
    hasIccProfile: tags.has(34675),
    hasColorMetadata: tags.has(34675),
    hasOrientation: tags.has(274),
  };
}

function inspectTiff(bytes: Uint8Array): ImageMetadata {
  const tiff = readTiffMetadata(bytes, 0, bytes.length);
  return {
    format: "TIFF",
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
    isAnimated: false,
    isMalformed: !tiff.width || !tiff.height,
    ...tiff,
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
  let isAnimated = false;
  let isMalformed = false;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let offset = 8; offset + 12 <= bytes.length;) {
    const chunkLength = view.getUint32(offset);
    const chunkType = readAscii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    if (chunkLength > bytes.length - dataOffset - 4) {
      isMalformed = true;
      break;
    }
    if (
      (offset === 8 && chunkType !== "IHDR") ||
      (!sawHeader && chunkType !== "IHDR")
    ) {
      isMalformed = true;
    }
    if (chunkType === "IHDR") {
      if (sawHeader || chunkLength !== 13) isMalformed = true;
      sawHeader = true;
    }
    if (chunkType === "IHDR" && chunkLength === 13) {
      width = view.getUint32(dataOffset);
      height = view.getUint32(dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const channels =
        colorType === 0
          ? 1
          : colorType === 2
            ? 3
            : colorType === 3
              ? 1
              : colorType === 4
                ? 2
                : colorType === 6
                  ? 4
                  : 0;
      bitsPerPixel = bitDepth * channels;
      colorMode =
        colorType === 2
          ? "RGB"
          : colorType === 6
            ? "RGBA"
            : colorType === 3
              ? "Indexed"
              : colorType === 0 || colorType === 4
                ? "Grayscale"
                : "Unknown";
    } else if (chunkType === "IDAT") {
      sawImageData = true;
    } else if (chunkType === "iCCP") {
      hasIccProfile = true;
      hasColorMetadata = true;
    } else if (["sRGB", "gAMA", "cHRM", "cICP"].includes(chunkType)) {
      hasColorMetadata = true;
    } else if (chunkType === "eXIf") {
      const exif = readTiffMetadata(bytes, dataOffset, chunkLength);
      hasOrientation = Boolean(exif.hasOrientation);
    } else if (chunkType === "acTL") {
      isAnimated = true;
    } else if (chunkType === "IEND") {
      if (chunkLength !== 0 || !sawImageData) isMalformed = true;
      sawEnd = true;
    }
    offset = dataOffset + chunkLength + 4;
    if (chunkType === "IEND") break;
  }
  if (!sawHeader || !sawImageData || !sawEnd || !width || !height) {
    isMalformed = true;
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
    isAnimated,
    isMalformed,
  };
}

function inspectJpeg(bytes: Uint8Array): ImageMetadata {
  let width: number | undefined;
  let height: number | undefined;
  let bitsPerPixel: number | undefined;
  let colorMode: ColorMode | undefined;
  let hasIccProfile = false;
  let hasOrientation = false;
  let sawFrame = false;
  let sawScan = false;
  let isMalformed = false;

  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) {
      isMalformed = true;
      break;
    }
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) {
      isMalformed = true;
      break;
    }
    const marker = bytes[offset++];
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) {
      isMalformed = true;
      break;
    }
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    const dataOffset = offset + 2;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      isMalformed = true;
      break;
    }
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
      const exif = readTiffMetadata(bytes, dataOffset + 6, dataLength - 6);
      hasOrientation = Boolean(exif.hasOrientation);
    } else if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker) &&
      dataLength >= 6
    ) {
      const precision = bytes[dataOffset];
      height = (bytes[dataOffset + 1] << 8) | bytes[dataOffset + 2];
      width = (bytes[dataOffset + 3] << 8) | bytes[dataOffset + 4];
      const components = bytes[dataOffset + 5];
      bitsPerPixel = precision * components;
      colorMode =
        components === 3 ? "RGB" : components === 4 ? "CMYK" : "Grayscale";
      sawFrame = true;
    }
    if (marker === 0xda) {
      sawScan = true;
      break;
    }
    offset += segmentLength;
  }
  const hasEndMarker =
    bytes.length >= 2 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9;
  if (!sawFrame || !sawScan || !hasEndMarker || !width || !height) {
    isMalformed = true;
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
    isAnimated: false,
    isMalformed,
  };
}

function skipGifSubBlocks(bytes: Uint8Array, start: number) {
  let offset = start;
  while (offset < bytes.length) {
    const blockLength = bytes[offset++];
    if (blockLength === 0) return offset;
    if (offset + blockLength > bytes.length) return undefined;
    offset += blockLength;
  }
  return undefined;
}

function inspectGif(bytes: Uint8Array): ImageMetadata {
  const width = bytes.length >= 10 ? bytes[6] | (bytes[7] << 8) : undefined;
  const height = bytes.length >= 10 ? bytes[8] | (bytes[9] << 8) : undefined;
  let isMalformed = bytes.length < 13 || !width || !height;
  let isAnimated = false;
  let offset = 13;
  let frameCount = 0;
  let sawTrailer = false;

  if (!isMalformed) {
    const packed = bytes[10];
    if (packed & 0x80) offset += 3 * 2 ** ((packed & 0x07) + 1);
    if (offset > bytes.length) isMalformed = true;
  }

  while (!isMalformed && offset < bytes.length) {
    const blockType = bytes[offset++];
    if (blockType === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (blockType === 0x21) {
      if (offset >= bytes.length) {
        isMalformed = true;
        break;
      }
      const nextOffset = skipGifSubBlocks(bytes, offset + 1);
      if (nextOffset === undefined) {
        isMalformed = true;
        break;
      }
      offset = nextOffset;
      continue;
    }
    if (blockType !== 0x2c || offset + 9 > bytes.length) {
      isMalformed = true;
      break;
    }

    const imagePacked = bytes[offset + 8];
    offset += 9;
    if (imagePacked & 0x80) offset += 3 * 2 ** ((imagePacked & 0x07) + 1);
    if (offset >= bytes.length) {
      isMalformed = true;
      break;
    }
    offset += 1; // LZW minimum code size
    const nextOffset = skipGifSubBlocks(bytes, offset);
    if (nextOffset === undefined) {
      isMalformed = true;
      break;
    }
    offset = nextOffset;
    frameCount += 1;
  }

  if (!sawTrailer || frameCount === 0) isMalformed = true;
  isAnimated = frameCount > 1;
  return {
    format: "GIF",
    width,
    height,
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
    isAnimated,
    isMalformed,
  };
}

function inspectWebp(bytes: Uint8Array): ImageMetadata {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredLength = bytes.length >= 8 ? view.getUint32(4, true) + 8 : 0;
  let isMalformed = declaredLength !== bytes.length || bytes.length < 20;
  let isAnimated = false;
  let sawImageChunk = false;

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (chunkLength > bytes.length - dataOffset) {
      isMalformed = true;
      break;
    }
    if (["VP8 ", "VP8L", "ANMF"].includes(chunkType)) sawImageChunk = true;
    if (chunkType === "VP8X" && chunkLength > 0 && bytes[dataOffset] & 0x02) {
      isAnimated = true;
    }
    if (chunkType === "ANIM" || chunkType === "ANMF") isAnimated = true;
    offset = dataOffset + chunkLength + (chunkLength & 1);
    if (offset > bytes.length) {
      isMalformed = true;
      break;
    }
  }
  if (!sawImageChunk) isMalformed = true;

  return {
    format: "WEBP",
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
    isAnimated,
    isMalformed,
  };
}

function inspectImage(bytes: Uint8Array): ImageMetadata {
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return inspectJpeg(bytes);
  if (matches(bytes, 0, [137, 80, 78, 71, 13, 10, 26, 10]))
    return inspectPng(bytes);
  if (
    matches(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) ||
    matches(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return inspectTiff(bytes);
  if (
    bytes.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(readAscii(bytes, 0, 6))
  )
    return inspectGif(bytes);
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    return inspectWebp(bytes);
  }
  return {
    format: "Unknown",
    hasIccProfile: false,
    hasColorMetadata: false,
    hasOrientation: false,
    isAnimated: false,
    isMalformed: false,
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
  const requirements = COVER_ART_PLATFORM_REQUIREMENTS[platform];
  const allowedFormats = new Set<ImageFormat>(requirements.formats);
  const platformLabel = platform === "spotify" ? "Spotify" : "Apple Music";
  const checks: CoverPreflightCheck[] = [];
  const fileTypeMismatch =
    declaredType &&
    metadata.format !== "Unknown" &&
    declaredType !== "application/octet-stream" &&
    !(
      (metadata.format === "JPEG" &&
        ["image/jpeg", "image/jpg"].includes(declaredType)) ||
      (metadata.format === "PNG" && declaredType === "image/png") ||
      (metadata.format === "TIFF" &&
        ["image/tiff", "image/tif"].includes(declaredType)) ||
      (metadata.format === "GIF" && declaredType === "image/gif") ||
      (metadata.format === "WEBP" && declaredType === "image/webp")
    );

  checks.push(
    metadata.format !== "Unknown" &&
      allowedFormats.has(metadata.format) &&
      !fileTypeMismatch
      ? check(
          "format",
          "File format",
          "pass",
          `${metadata.format} is listed in ${platformLabel}'s published cover-art formats.${requirements.losslessEncoding ? " This byte check cannot verify lossless encoding." : ""}`,
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
            ? "Choose an original file in one of the listed formats and make sure its contents match its file type."
            : `Export a ${formatCoverArtFormats(requirements.formats)} file.`,
        ),
  );

  checks.push(
    check(
      "file-integrity",
      "File structure",
      metadata.isMalformed
        ? "issue"
        : metadata.format === "Unknown"
          ? "review"
          : "pass",
      metadata.isMalformed
        ? "The file appears incomplete or its required image structure could not be read."
        : metadata.format === "Unknown"
          ? "The checker does not recognize this format, so it could not inspect the file structure."
          : "No obvious truncation was detected. This byte-level check does not decode every image pixel.",
      metadata.isMalformed
        ? "Export a fresh still image from your original artwork and check the new file."
        : undefined,
    ),
  );
  if (metadata.isAnimated) {
    checks.push(
      check(
        "animation",
        "Still image",
        "issue",
        "Multiple image frames or animation markers were detected; cover artwork should be a still image.",
        "Export a single-frame still image from the intended frame.",
      ),
    );
  }

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
    const [ratioWidth, ratioHeight] = requirements.aspectRatio
      .split(":")
      .map(Number);
    const square =
      metadata.width * ratioHeight === metadata.height * ratioWidth;
    const shapeLabel =
      requirements.aspectRatio === "1:1"
        ? "Square artwork"
        : `${requirements.aspectRatio} artwork`;
    checks.push(
      check(
        "shape",
        shapeLabel,
        square ? "pass" : "issue",
        square
          ? `The image matches the ${requirements.aspectRatio} aspect ratio (${metadata.width} × ${metadata.height} px).`
          : `The image is ${metadata.width} × ${metadata.height} px, not ${requirements.aspectRatio}.`,
        square
          ? undefined
          : `Crop or recompose the original artwork to a ${requirements.aspectRatio} aspect ratio before exporting. This check will not crop it for you.`,
      ),
    );

    const withinMaximum =
      requirements.maximumDimension === null ||
      (metadata.width <= requirements.maximumDimension &&
        metadata.height <= requirements.maximumDimension);
    const meetsDimensions =
      metadata.width >= requirements.minimumDimension &&
      metadata.height >= requirements.minimumDimension &&
      withinMaximum;
    const requirement = describeCoverArtDimensions(requirements);
    checks.push(
      check(
        "dimensions",
        "Pixel dimensions",
        meetsDimensions ? "pass" : "issue",
        `${metadata.width} × ${metadata.height} px; ${platformLabel} lists ${requirement}.`,
        meetsDimensions
          ? undefined
          : requirements.doNotUpscale
            ? "Export from a sufficiently large original at the required size. Do not upscale a smaller file to meet the minimum."
            : "Export from a sufficiently large original at the required size.",
      ),
    );
  }

  if (requirements.color) {
    const colorRequirement = requirements.color;
    const colorProblems: string[] = [];
    if (metadata.colorMode && metadata.colorMode !== colorRequirement.mode) {
      colorProblems.push(
        `the image is ${metadata.colorMode}, not ${colorRequirement.mode}`,
      );
    }
    if (
      metadata.bitsPerPixel !== undefined &&
      metadata.bitsPerPixel !== colorRequirement.bitsPerPixel
    ) {
      colorProblems.push(
        `the image is ${metadata.bitsPerPixel} bits per pixel, not ${colorRequirement.bitsPerPixel}`,
      );
    }
    checks.push(
      colorProblems.length
        ? check(
            "color-space",
            "Color space and depth",
            "issue",
            `${requirements.label}'s guidance calls for ${colorRequirement.bitsPerPixel}-bit ${colorRequirement.mode}; ${colorProblems.join(" and ")}.`,
            `Export a ${colorRequirement.mode} image at ${colorRequirement.bitsPerPixel} bits per pixel and apply ${colorRequirement.colorSpace} to the pixel values. This tool does not convert the image.`,
          )
        : metadata.colorMode && metadata.bitsPerPixel !== undefined
          ? check(
              "color-space",
              "Color space and depth",
              "review",
              `${colorRequirement.mode} at ${colorRequirement.bitsPerPixel} bits per pixel was detected. A byte check cannot prove that the pixel values are ${colorRequirement.colorSpace}.`,
              `Confirm that your export applied ${colorRequirement.colorSpace} directly to the pixel values.`,
            )
          : check(
              "color-space",
              "Color space and depth",
              "review",
              `The checker could not confirm both ${colorRequirement.mode} color mode and ${colorRequirement.bitsPerPixel}-bit depth from this file.`,
              `Verify the export settings with an image editor and confirm ${colorRequirement.mode}, ${colorRequirement.bitsPerPixel} bits per pixel, and ${colorRequirement.colorSpace} applied to the pixel values.`,
            ),
    );

    checks.push(
      metadata.hasIccProfile &&
        colorRequirement.profilePlacement === "applied-to-values"
        ? check(
            "color-profile",
            "Embedded color profile",
            "issue",
            `An embedded ICC profile was found. ${requirements.label}'s cited guidance asks for the profile applied directly to the color values, not embedded in the file.`,
            `Apply ${colorRequirement.colorSpace} to the pixel values during export, then remove the embedded profile metadata.`,
          )
        : metadata.hasColorMetadata
          ? check(
              "color-profile",
              "Embedded color profile",
              "review",
              `Color-related metadata was found, but no embedded ICC profile was detected. Confirm the export matches ${requirements.label}'s current metadata rules.`,
              "Check the final export's color settings and remove profile metadata if your delivery provider requires it.",
            )
          : check(
              "color-profile",
              "Embedded color profile",
              "pass",
              "No embedded ICC profile or color-profile metadata was detected.",
            ),
    );
  }

  if (requirements.orientationMetadata !== "unspecified") {
    checks.push(
      metadata.hasOrientation && requirements.orientationMetadata === "avoid"
        ? check(
            "orientation-metadata",
            "Orientation metadata",
            "issue",
            `An orientation tag was found. The cited ${requirements.label} guidance says not to include orientation metadata.`,
            "Apply the intended orientation to the pixels and export without the orientation tag.",
          )
        : check(
            "orientation-metadata",
            "Orientation metadata",
            "pass",
            "No orientation tag was detected.",
          ),
    );
  }

  const unspecifiedMetadataRules = [
    requirements.color === null ? "a color-profile" : "",
    requirements.orientationMetadata === "unspecified"
      ? "an orientation-metadata"
      : "",
  ].filter(Boolean);
  if (unspecifiedMetadataRules.length > 0) {
    checks.push(
      check(
        "color-metadata",
        "Color and orientation metadata",
        "info",
        `The cited ${requirements.source.publisher} cover-art guidance does not specify ${unspecifiedMetadataRules.join(" or ")} requirement${unspecifiedMetadataRules.length === 1 ? "" : "s"}. Check your distributor's current rules.`,
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

export type RasterInfo = {
  format: "webp" | "png" | "jpeg";
  width: number;
  height: number;
  bytes: number;
};

export class RasterValidationError extends Error {
  reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = "RasterValidationError";
    this.reason = reason;
  }
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const uint24le = (bytes: Uint8Array, start: number) =>
  bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);

const uint32le = (bytes: Uint8Array, start: number) =>
  (bytes[start]
    | (bytes[start + 1] << 8)
    | (bytes[start + 2] << 16)
    | (bytes[start + 3] << 24)) >>> 0;

function dimensionsForChunk(bytes: Uint8Array, type: string, start: number, size: number) {
  if (type === "VP8X") {
    if (size < 10) throw new RasterValidationError("truncated_vp8x", "WebP VP8X header is truncated.");
    if ((bytes[start] & 0x02) !== 0) {
      throw new RasterValidationError("animated_webp", "Animated WebP output is not accepted.");
    }
    return {
      width: uint24le(bytes, start + 4) + 1,
      height: uint24le(bytes, start + 7) + 1,
      extended: true,
    };
  }
  if (type === "VP8 ") {
    if (size < 10
      || bytes[start + 3] !== 0x9d
      || bytes[start + 4] !== 0x01
      || bytes[start + 5] !== 0x2a) {
      throw new RasterValidationError("invalid_vp8", "WebP VP8 frame header is invalid.");
    }
    return {
      width: (bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff,
      height: (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff,
      extended: false,
    };
  }
  if (type === "VP8L") {
    if (size < 5 || bytes[start] !== 0x2f) {
      throw new RasterValidationError("invalid_vp8l", "WebP VP8L frame header is invalid.");
    }
    return {
      width: 1 + bytes[start + 1] + ((bytes[start + 2] & 0x3f) << 8),
      height: 1
        + ((bytes[start + 2] & 0xc0) >> 6)
        + (bytes[start + 3] << 2)
        + ((bytes[start + 4] & 0x0f) << 10),
      extended: false,
    };
  }
  return null;
}

export function inspectWebp(bytes: Uint8Array): RasterInfo {
  if (bytes.byteLength < 20
    || ascii(bytes, 0, 4) !== "RIFF"
    || ascii(bytes, 8, 4) !== "WEBP") {
    throw new RasterValidationError("invalid_magic", "Output is not a WebP raster.");
  }
  const declaredBytes = uint32le(bytes, 4) + 8;
  if (declaredBytes !== bytes.byteLength) {
    throw new RasterValidationError("riff_size_mismatch", "WebP byte length does not match its RIFF header.");
  }

  let offset = 12;
  let canvas: { width: number; height: number } | null = null;
  let frame: { width: number; height: number } | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const type = ascii(bytes, offset, 4);
    const size = uint32le(bytes, offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > bytes.byteLength) {
      throw new RasterValidationError("truncated_chunk", "WebP chunk exceeds the declared raster length.");
    }
    const dimensions = dimensionsForChunk(bytes, type, start, size);
    if (dimensions?.extended) canvas = dimensions;
    else if (dimensions) frame = dimensions;
    offset = end + (size % 2);
  }
  if (offset !== bytes.byteLength) {
    throw new RasterValidationError("invalid_padding", "WebP chunk padding is invalid.");
  }
  if (!frame) {
    throw new RasterValidationError("missing_frame", "WebP contains no decodable static frame header.");
  }
  const dimensions = canvas ?? frame;
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new RasterValidationError("invalid_dimensions", "WebP dimensions are invalid.");
  }
  if (canvas && (frame.width > canvas.width || frame.height > canvas.height)) {
    throw new RasterValidationError("frame_exceeds_canvas", "WebP frame exceeds its declared canvas.");
  }
  return { format: "webp", width: dimensions.width, height: dimensions.height, bytes: bytes.byteLength };
}

// A watermark renderer that silently proxies its input would publish the clean
// original as the "preview". Comparing content digests catches that regardless
// of how the renderer is implemented or which transport it used.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // WebCrypto rejects a view backed by a SharedArrayBuffer. Every caller here
  // owns a plain ArrayBuffer, so the common path hashes in place and only an
  // exotic input pays for a copy.
  const source = bytes.buffer instanceof ArrayBuffer
    ? bytes as Uint8Array<ArrayBuffer>
    : Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function digestsMatch(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function validateSquareWebp(
  bytes: Uint8Array,
  expectedSize: 1024 | 2048,
  maximumBytes = 20 * 1024 * 1024,
): RasterInfo {
  if (bytes.byteLength > maximumBytes) {
    throw new RasterValidationError("output_too_large", "Generated raster exceeds the storage safety limit.");
  }
  const info = inspectWebp(bytes);
  if (info.width !== expectedSize || info.height !== expectedSize) {
    throw new RasterValidationError(
      "unexpected_dimensions",
      `Expected ${expectedSize}x${expectedSize} WebP output.`,
    );
  }
  return info;
}

// xAI's image edits let callers choose dimensions but not an output codec; the
// response `mime_type` is whatever the model emits (png | jpeg | webp). The
// clean-asset gate therefore accepts any of those three formats as long as the
// frame is square and matches the exact catalog size. The watermarked preview is
// still produced as WebP by the external raster renderer and validated with
// `validateSquareWebp`, so the preview pipeline keeps its format contract.

// PNG signature: 89 50 4E 47 0D 0A 1A 0A. Dimensions live in the IHDR chunk's
// first two big-endian uint32 fields (width at byte 16, height at byte 20).
export function inspectPng(bytes: Uint8Array): RasterInfo {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.byteLength < 24 || !signature.every((byte, index) => bytes[index] === byte)) {
    throw new RasterValidationError("invalid_png_signature", "Output is not a PNG raster.");
  }
  if (ascii(bytes, 12, 4) !== "IHDR") {
    throw new RasterValidationError("missing_ihdr", "PNG is missing its IHDR chunk.");
  }
  const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  if (width <= 0 || height <= 0) {
    throw new RasterValidationError("invalid_dimensions", "PNG dimensions are invalid.");
  }
  return { format: "png", width, height, bytes: bytes.byteLength };
}

// JPEG has no global header; frame dimensions are carried by the first SOFn
// marker (precision + height + width, all big-endian) found after the FF D8 SOI.
export function inspectJpeg(bytes: Uint8Array): RasterInfo {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new RasterValidationError("invalid_jpeg_signature", "Output is not a JPEG raster.");
  }
  const isSof = (marker: number) =>
    marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3
    || marker === 0xc5 || marker === 0xc6 || marker === 0xc7
    || marker === 0xc9 || marker === 0xca || marker === 0xcb
    || marker === 0xcd || marker === 0xce || marker === 0xcf;
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      throw new RasterValidationError("invalid_jpeg", "JPEG segment marker is misaligned.");
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= bytes.byteLength) {
      throw new RasterValidationError("truncated_jpeg", "JPEG segment length is truncated.");
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.byteLength) {
      throw new RasterValidationError("truncated_jpeg", "JPEG segment exceeds the raster length.");
    }
    if (isSof(marker) && length >= 7) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width <= 0 || height <= 0) {
        throw new RasterValidationError("invalid_dimensions", "JPEG dimensions are invalid.");
      }
      return { format: "jpeg", width, height, bytes: bytes.byteLength };
    }
    offset += 2 + length;
  }
  throw new RasterValidationError("missing_sof", "JPEG contains no frame header.");
}

// Accepts clean assets from providers that cannot return WebP on request (xAI
// grok-imagine) while preserving the catalog's square + exact-size + 20 MB
// storage safety invariant. The watermarked preview path keeps using
// `validateSquareWebp` so previews remain WebP end to end.
export function validateSquareRaster(
  bytes: Uint8Array,
  expectedSize: 1024 | 2048,
  maximumBytes = 20 * 1024 * 1024,
): RasterInfo {
  if (bytes.byteLength > maximumBytes) {
    throw new RasterValidationError("output_too_large", "Generated raster exceeds the storage safety limit.");
  }
  let info: RasterInfo;
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    info = inspectWebp(bytes);
  } else if (
    bytes.byteLength >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    info = inspectPng(bytes);
  } else if (bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    info = inspectJpeg(bytes);
  } else {
    throw new RasterValidationError("invalid_magic", "Output is not a supported raster format (WebP, PNG, or JPEG).");
  }
  if (info.width !== expectedSize || info.height !== expectedSize) {
    throw new RasterValidationError(
      "unexpected_dimensions",
      `Expected ${expectedSize}x${expectedSize} output.`,
    );
  }
  return info;
}

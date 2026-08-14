export type RasterInfo = {
  format: "webp";
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

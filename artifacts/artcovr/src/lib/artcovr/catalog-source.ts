export type CandidateMetadata = {
  id: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
};

export type CandidateIssueCode =
  | "ZERO_BYTES"
  | "NOT_SQUARE"
  | "TOO_SMALL"
  | "DUPLICATE_SHA256";

export type CandidateIssue = {
  id: string;
  code: CandidateIssueCode;
};

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
  0xcf,
]);

export function decodePngHeader(bytes: Uint8Array): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
} {
  const buffer = Buffer.from(bytes);
  if (
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(pngSignature) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Invalid or truncated PNG header.");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error("PNG dimensions must be nonzero.");
  return { width, height, bitDepth: buffer[24] ?? 0, colorType: buffer[25] ?? 0 };
}

export function decodeJpegHeader(bytes: Uint8Array): { width: number; height: number } {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Invalid or truncated JPEG header.");
  }
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset] ?? 0;
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (jpegStartOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (width > 0 && height > 0) return { width, height };
      break;
    }
    offset += segmentLength;
  }
  throw new Error("JPEG dimensions were not found.");
}

export function decodeImageHeader(bytes: Uint8Array): {
  format: "png" | "jpeg";
  width: number;
  height: number;
} {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 8).equals(pngSignature)) {
    const header = decodePngHeader(buffer);
    return { format: "png", width: header.width, height: header.height };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { format: "jpeg", ...decodeJpegHeader(buffer) };
  }
  throw new Error("Unsupported image content; expected PNG or JPEG.");
}

export function makeCatalogSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateCandidateMetadata(candidates: CandidateMetadata[]): CandidateIssue[] {
  const issues: CandidateIssue[] = [];
  const seenHashes = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.bytes <= 0) issues.push({ id: candidate.id, code: "ZERO_BYTES" });
    if (candidate.width !== candidate.height) {
      issues.push({ id: candidate.id, code: "NOT_SQUARE" });
    } else if (candidate.width < 1024) {
      issues.push({ id: candidate.id, code: "TOO_SMALL" });
    }
    const hash = candidate.sha256.toLowerCase();
    if (seenHashes.has(hash)) issues.push({ id: candidate.id, code: "DUPLICATE_SHA256" });
    else seenHashes.add(hash);
  }
  return issues;
}

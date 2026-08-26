/**
 * Reference-upload re-encoder — the worker upload-reference's transcode.ts
 * calls. Implements that file's documented contract exactly:
 *
 *   POST /
 *   Authorization: Bearer <TRANSCODE_TOKEN>
 *   Content-Type: image/jpeg | image/png | image/webp
 *   X-Max-Long-Side: <pixels>
 *   X-Output-Format: webp
 *   body: raw uploaded bytes
 *
 *   200 -> image/webp, long side <= X-Max-Long-Side, aspect preserved
 *   4xx -> the bytes are not a decodable still image / bad request
 *
 * Decoding happens HERE, on the actual pixels. Animated inputs are rejected
 * rather than flattened: a "still reference" that secretly carried frames is
 * exactly the kind of ambiguity the contract exists to remove. Metadata (EXIF,
 * colour profiles, maker notes) never survives because sharp re-encodes from
 * decoded pixels — nothing is copied from the source container.
 *
 * Deploy anywhere Bun + sharp run (VPS, Railway, Fly). Point the Supabase
 * function at it via REFERENCE_TRANSCODE_URL / REFERENCE_TRANSCODE_TOKEN.
 */
import sharp from "sharp";

const token = process.env.TRANSCODE_TOKEN ?? "";
const port = Number(process.env.PORT ?? 8791);
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

function reject(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}

const server = Bun.serve({
  port,
  // The 8MB body cap is enforced by Bun before the handler runs.
  maxRequestBodySize: MAX_BODY_BYTES,
  async fetch(request) {
    if (request.method !== "POST") {
      return reject(405, "method_not_allowed", "Use POST.");
    }
    if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
      return reject(401, "unauthorized", "Bad or missing bearer token.");
    }

    const contentType = (request.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ACCEPTED.has(contentType)) {
      return reject(415, "unsupported_media_type", "Send image/jpeg, image/png or image/webp bytes.");
    }

    const outputFormat = (request.headers.get("x-output-format") ?? "webp").toLowerCase();
    if (outputFormat !== "webp") {
      return reject(400, "unsupported_output", "Only webp output is supported.");
    }

    const maxLongSide = Number(request.headers.get("x-max-long-side") ?? "1024");
    if (!Number.isInteger(maxLongSide) || maxLongSide < 64 || maxLongSide > 4096) {
      return reject(400, "invalid_bound", "X-Max-Long-Side must be an integer between 64 and 4096.");
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0) return reject(400, "empty_body", "No image bytes received.");

    let pipeline: sharp.Sharp;
    let metadata: sharp.Metadata;
    try {
      // `pages` exposes animation; `limitInputPixels` bounds decode cost before
      // any pixel work happens.
      pipeline = sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: false });
      metadata = await pipeline.metadata();
    } catch {
      return reject(422, "undecodable", "The bytes could not be decoded as an image.");
    }

    if (!metadata.width || !metadata.height) {
      return reject(422, "undecodable", "The image reports no dimensions.");
    }
    if ((metadata.pages ?? 1) > 1) {
      return reject(422, "animated_input", "Animated images are not accepted as references.");
    }

    try {
      const output = await pipeline
        .rotate() // honour EXIF orientation BEFORE the metadata is discarded
        .resize({
          width: maxLongSide,
          height: maxLongSide,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90, effort: 4 })
        .toBuffer();
      return new Response(new Uint8Array(output), {
        status: 200,
        headers: { "content-type": "image/webp", "cache-control": "no-store" },
      });
    } catch {
      return reject(422, "reencode_failed", "The image decoded but could not be re-encoded.");
    }
  },
});

console.log(`reference-transcode listening on :${server.port}`);

import { HttpError } from "../_shared/errors.ts";
import type { RasterInfo } from "../_shared/raster.ts";
import {
  MAXIMUM_REFERENCE_UPLOAD_BYTES,
  REFERENCE_LONG_SIDE,
  RasterValidationError,
  validateBoundedWebp,
} from "../_shared/raster.ts";

// Re-encodes an uploaded reference image.
//
// The bytes a client sends are never stored. They exist in this request's
// memory and in the re-encoder's, and the only object written to the private
// bucket is the WebP this returns. That removes the original container and its
// metadata (EXIF location, maker notes, embedded thumbnails, colour profiles),
// caps the resolution the provider ever sees, and means an exotic-but-parsable
// container cannot be handed on unchanged.
//
// Deploy a Cloudflare Worker (or equivalent) alongside the watermark renderer:
//
//   POST <REFERENCE_TRANSCODE_URL>
//   Authorization: Bearer <REFERENCE_TRANSCODE_TOKEN>
//   Content-Type: image/jpeg | image/png | image/webp
//   X-Max-Long-Side: <pixels>
//   X-Output-Format: webp
//   body: the raw uploaded bytes
//
//   200 -> Content-Type: image/webp, body: the re-encoded bytes, downscaled so
//          the long side is at most X-Max-Long-Side, aspect ratio preserved,
//          animation flattened or rejected.
//   any other status -> the bytes could not be decoded as a still image.
//
// The re-encoder is what actually decodes the pixels; the structural check in
// _shared/raster.ts only ensures it is asked to decode something plausible.
// A missing re-encoder is deliberately an error. Falling back to storing the
// client's own bytes would defeat the point, and reusing the watermark renderer
// would stamp "PREVIEW" across a user's private reference.

const endpoint = Deno.env.get("REFERENCE_TRANSCODE_URL");
const token = Deno.env.get("REFERENCE_TRANSCODE_TOKEN");
const timeoutMilliseconds = 20_000;

export async function transcodeReference(
  bytes: Uint8Array,
  contentType: string,
): Promise<{ bytes: Uint8Array; info: RasterInfo }> {
  if (!endpoint || !token) {
    throw new HttpError(500, "reference_transcode_not_configured", "The reference image re-encoder is not configured.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
        "X-Max-Long-Side": String(REFERENCE_LONG_SIDE),
        "X-Output-Format": "webp",
      },
      body: bytes,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "reference_transcode_timed_out", "Re-encoding the reference image timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 415 || response.status === 422) {
    throw new HttpError(422, "invalid_reference_image", "That file could not be read as a still JPEG, PNG or WebP image.");
  }
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/webp")) {
    throw new HttpError(502, "reference_transcode_failed", "The reference image could not be re-encoded.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_REFERENCE_UPLOAD_BYTES) {
    throw new HttpError(502, "reference_transcode_too_large", "The re-encoded reference image exceeds the storage safety limit.");
  }
  const encoded = new Uint8Array(await response.arrayBuffer());
  try {
    return { bytes: encoded, info: validateBoundedWebp(encoded, REFERENCE_LONG_SIDE) };
  } catch (error) {
    if (error instanceof RasterValidationError) {
      console.error("Reference re-encode validation failed", { reason: error.reason });
      throw new HttpError(502, "reference_transcode_invalid_raster", "The reference re-encoder returned invalid image data.");
    }
    throw error;
  }
}

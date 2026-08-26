import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { postgresHttpError } from "../_shared/postgres-errors.ts";
import type { RasterInfo } from "../_shared/raster.ts";
import {
  MAXIMUM_REFERENCE_UPLOAD_BYTES,
  REFERENCE_MEDIA_TYPES,
  RasterValidationError,
  sha256Hex,
  validateReferenceSource,
} from "../_shared/raster.ts";
import { removePrivate, uploadPrivate } from "../_shared/storage.ts";
import { admin, requireUser } from "../_shared/supabase.ts";
import { transcodeReference } from "./transcode.ts";

// Accepts one reference image from a signed-in account and returns an opaque id
// the generation request can name later.
//
// Transport is a raw body, not multipart: the request carries the image bytes
// and nothing else, so there is no parser to harden and no field a caller could
// smuggle a second value through. The artwork the upload is bound to travels as
// the `artworkId` query parameter, because the shared CORS allow-list does not
// admit a custom request header and a public catalog id is not personal data.
//
//   POST /functions/v1/upload-reference?artworkId=<catalog id>
//   Authorization: Bearer <session access token>
//   Content-Type: image/jpeg | image/png | image/webp
//   body: the raw image bytes (at most 8 MB)
//
//   201 -> { "referenceUploadId": "<uuid>" }
//
// The response never contains an object key, a bucket path or a signed URL. The
// stored object is reachable only by the server resolving this id back through
// public.request_generation.

const acceptedMediaTypes = new Set(Object.values(REFERENCE_MEDIA_TYPES));

function declaredMediaType(request: Request): string {
  const declared = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!acceptedMediaTypes.has(declared)) {
    throw new HttpError(415, "unsupported_media_type", "Upload a JPEG, PNG or WebP image.");
  }
  return declared;
}

function requestedArtworkId(request: Request): string {
  const value = new URL(request.url).searchParams.get("artworkId")?.trim() ?? "";
  if (value.length < 1 || value.length > 200) {
    throw new HttpError(400, "invalid_request", "artworkId is required.");
  }
  return value;
}

// Reads the body under a hard byte ceiling instead of trusting Content-Length,
// which is absent on a chunked upload and attacker-controlled when present.
async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_REFERENCE_UPLOAD_BYTES) {
    throw new HttpError(413, "reference_too_large", "Reference images must be 8 MB or smaller.");
  }
  if (!request.body) throw new HttpError(400, "invalid_request", "A request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMUM_REFERENCE_UPLOAD_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "reference_too_large", "Reference images must be 8 MB or smaller.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// Anything that fails after admission gives the allowance back and leaves no
// orphan: the pending row is removed, and so is the object if one was written.
async function discardPendingUpload(uploadId: string | null, objectKey: string | null) {
  if (objectKey) await removePrivate([objectKey]);
  if (!uploadId) return;
  const { error } = await admin.from("reference_uploads").delete().eq("id", uploadId);
  if (error) {
    console.error("Reference upload cleanup failed", { uploadId, message: error.message });
  }
}

Deno.serve(async (request) => {
  const options = preflight(request); if (options) return options;
  let admittedUploadId: string | null = null;
  let storedObjectKey: string | null = null;
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const user = await requireUser(request);
    const artworkId = requestedArtworkId(request);
    const mediaType = declaredMediaType(request);

    // The key is derived from the account and a server-generated id. The client
    // never proposes a path, so it cannot address another account's prefix or
    // overwrite an existing object.
    const uploadId = crypto.randomUUID();
    const objectKey = `reference-uploads/${user.id}/${uploadId}.webp`;

    // Admission first: the rate bound is checked and the row reserved before any
    // bytes are read, decoded or re-encoded.
    const { data: artworkUuid, error: admitError } = await admin.rpc("admit_reference_upload", {
      p_user_id: user.id,
      p_catalog_id: artworkId,
      p_upload_id: uploadId,
      p_object_key: objectKey,
    });
    if (admitError) {
      throw postgresHttpError(admitError, {
        status: 429,
        code: "reference_upload_rate_limited",
        message: "Too many reference uploads. Try again later.",
      });
    }
    if (!artworkUuid) {
      throw new HttpError(409, "reference_upload_unavailable", "The reference upload could not be admitted.");
    }
    admittedUploadId = uploadId;

    const original = await readBoundedBody(request);
    let sourceInfo: RasterInfo;
    try {
      sourceInfo = validateReferenceSource(original);
    } catch (error) {
      if (error instanceof RasterValidationError) {
        console.error("Reference upload rejected", { reason: error.reason });
        throw new HttpError(422, "invalid_reference_image", error.message);
      }
      throw error;
    }
    // The parser was chosen by the magic bytes, so a mismatch means the declared
    // type was wrong. Refuse rather than quietly believing the bytes.
    if (REFERENCE_MEDIA_TYPES[sourceInfo.format] !== mediaType) {
      throw new HttpError(415, "reference_type_mismatch", "The file's contents do not match its declared type.");
    }

    const encoded = await transcodeReference(original, mediaType);
    const digest = await sha256Hex(encoded.bytes);

    await uploadPrivate(objectKey, encoded.bytes, "image/webp");
    storedObjectKey = objectKey;

    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_reference_upload", {
      p_upload_id: uploadId,
      p_user_id: user.id,
      p_object_key: objectKey,
      p_sha256: digest,
      p_width: encoded.info.width,
      p_height: encoded.info.height,
      p_bytes: encoded.bytes.byteLength,
    });
    if (finalizeError || !finalized) {
      throw new HttpError(409, "reference_upload_finalize_failed", "The reference upload could not be finalized.");
    }

    return privateJson({ referenceUploadId: uploadId }, 201);
  } catch (error) {
    await discardPendingUpload(admittedUploadId, storedObjectKey);
    return respondError(error);
  }
});

import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { editImage, imageModel, supportsReferenceUploads } from "../_shared/openai-images.ts";
import { postgresHttpError } from "../_shared/postgres-errors.ts";
import { PromptLengthError, buildGenerationPrompt } from "../_shared/prompt.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";
import { digestsMatch, sha256Hex } from "../_shared/raster.ts";
import { downloadPrivate, outputKeys, removePrivate, signPrivate, uploadPrivate, mimeTypeFor } from "../_shared/storage.ts";
import { rasterizePreview } from "../_shared/watermark.ts";

type RequestBody = {
  artworkId?: string;
  purchaseId?: string | null;
  referenceGenerationId?: string | null;
  referenceUploadId?: string | null;
  coverText?: { title?: string | null; artistName?: string | null } | null;
  styleMode?: "exact" | "expand" | null;
  resetToBase?: boolean;
  prompt?: string;
};

type RunningGeneration = {
  artwork_id: string;
  purchase_id: string | null;
  prompt: string;
  source_object_key: string;
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function release(id: string, status: "blocked" | "failed" | "timed_out", code: string) {
  await admin.rpc("release_generation_allowance", { p_generation_id: id, p_status: status, p_error_code: code });
}

// A consumed reference upload belongs to exactly one generation attempt. When
// that attempt does not produce a result, the upload is removed with it: the
// object goes first so a surviving row can never point at missing bytes, and
// generations.reference_upload_id falls to null through its on-delete rule.
async function discardReferenceUpload(objectKey: string | null) {
  if (!objectKey) return;
  await removePrivate([objectKey]);
  const { error } = await admin.from("reference_uploads").delete().eq("object_key", objectKey);
  if (error) console.error("Reference upload cleanup failed", { message: error.message });
}

async function runGeneration(
  generationId: string,
  userId: string,
  running: RunningGeneration,
  providerPrompt: string,
  referenceUploadKey: string | null,
) {
  const previewKey = outputKeys(running.artwork_id, generationId).preview;
  const uploaded: string[] = [];
  let finalized = false;
  try {
    const source = await downloadPrivate(running.source_object_key);
    // Both inputs are resolved from server-held object keys. The artwork stays
    // the image being edited; the upload is only ever an additional input.
    const references = referenceUploadKey ? [await downloadPrivate(referenceUploadKey)] : [];
    const result = await editImage(source, providerPrompt, Boolean(running.purchase_id), references);
    const cleanKey = outputKeys(running.artwork_id, generationId, result.format).clean;
    await uploadPrivate(cleanKey, result.bytes, mimeTypeFor(result.format));
    uploaded.push(cleanKey);
    const cleanForRenderer = await signPrivate(cleanKey, 60);
    const watermarked = await rasterizePreview(cleanForRenderer, running.purchase_id ? 2048 : 1024);
    const [cleanDigest, previewDigest] = await Promise.all([
      sha256Hex(result.bytes),
      sha256Hex(watermarked),
    ]);
    // A renderer that returns its input unchanged would hand the clean original
    // to every unpaid viewer. Fail before the preview object is ever written.
    if (digestsMatch(cleanDigest, previewDigest)) {
      throw new HttpError(502, "watermark_passthrough", "Raster watermark renderer returned the clean image unchanged.");
    }
    await uploadPrivate(previewKey, watermarked, "image/webp");
    uploaded.push(previewKey);
    const { data: completed, error: completeError } = await admin.rpc("complete_generation", {
      p_generation_id: generationId, p_preview_object_key: previewKey, p_clean_object_key: cleanKey,
      p_openai_request_id: result.requestId, p_usage: result.usage,
    });
    if (completeError || !completed) throw new HttpError(409, "generation_finalize_failed", "Generation could not be finalized.");
    finalized = true;
    await admin.from("analytics_events").insert({ user_id: userId, artwork_id: running.artwork_id, purchase_id: running.purchase_id, event_name: "generation_completed" });
  } catch (error) {
    const known = error instanceof HttpError ? error.code : "generation_failed";
    if (!finalized) await removePrivate(uploaded);
    if (!finalized) await discardReferenceUpload(referenceUploadKey);
    await release(
      generationId,
      known.includes("timed_out") ? "timed_out" : known === "generation_blocked" ? "blocked" : "failed",
      known,
    );
    console.error("generation worker failed", generationId, error);
  }
}

Deno.serve(async (request) => {
  const options = preflight(request); if (options) return options;
  let allocatedGenerationId: string | null = null;
  let allocatedReferenceUploadKey: string | null = null;
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const user = await requireUser(request);
    const body = await readJson<RequestBody>(request);
    if (!body.artworkId || !body.prompt) throw new HttpError(400, "invalid_request", "artworkId and prompt are required.");
    if (body.styleMode != null && body.styleMode !== "exact" && body.styleMode !== "expand") {
      throw new HttpError(400, "invalid_request", "styleMode must be \"exact\" or \"expand\".");
    }
    const coverTitle = body.coverText?.title ?? "";
    const coverArtist = body.coverText?.artistName ?? "";
    if (typeof coverTitle !== "string" || typeof coverArtist !== "string" || coverTitle.length > 120 || coverArtist.length > 120) {
      throw new HttpError(400, "cover_text_too_long", "Cover title and artist name must each be 120 characters or fewer.");
    }
    // A prior result is the source being edited; an upload is a style reference.
    // Both at once has no single meaning, so it is refused here and again in SQL.
    if (body.referenceGenerationId && body.referenceUploadId) {
      throw new HttpError(400, "dual_reference_conflict", "Provide either a previous result or an uploaded reference, not both.");
    }
    if (body.referenceUploadId && !supportsReferenceUploads) {
      throw new HttpError(501, "reference_upload_unsupported", "The configured image provider cannot accept an uploaded style reference.");
    }

    // Enrichment is deterministic and server-side: the artwork's own approved
    // style facts frame the user's text, which is carried through verbatim. It
    // runs before admission so an over-long combination costs no allowance, and
    // the row keeps the user's prompt while the provider receives this.
    const { data: anchor } = await admin
      .from("artworks")
      .select("title,category,mood_tags")
      .eq("catalog_id", body.artworkId)
      .maybeSingle();
    let providerPrompt: string;
    try {
      providerPrompt = buildGenerationPrompt({
        artwork: {
          title: anchor?.title ?? null,
          category: anchor?.category ?? null,
          moodTags: anchor?.mood_tags ?? null,
        },
        userPrompt: body.prompt,
        coverText: body.coverText ?? null,
        styleMode: body.styleMode ?? null,
        hasReferenceUpload: Boolean(body.referenceUploadId),
      });
    } catch (error) {
      if (error instanceof PromptLengthError) {
        throw new HttpError(400, "prompt_too_long", "The prompt is too long once this artwork's style anchor is applied. Shorten it and try again.");
      }
      throw error;
    }

    const { data: created, error: createError } = await admin.rpc("request_generation", {
      p_catalog_id: body.artworkId, p_user_id: user.id, p_purchase_id: body.purchaseId ?? null,
      p_reference_generation_id: body.referenceGenerationId ?? null, p_prompt: body.prompt,
      p_openai_model: imageModel, p_reset_to_base: body.resetToBase === true,
      p_reference_upload_id: body.referenceUploadId ?? null,
    });
    if (createError) {
      throw postgresHttpError(createError, {
        status: 409,
        code: "generation_unavailable",
        message: "Image generation is not currently available for this artwork.",
      });
    }
    const job = created?.[0] as {
      generation_id: string;
      source_object_key: string;
      reference_upload_object_key: string | null;
    } | undefined;
    if (!job) throw new HttpError(409, "generation_unavailable", "No generation allowance is available.");
    const generationId = job.generation_id;
    allocatedGenerationId = generationId;
    const referenceUploadKey = job.reference_upload_object_key ?? null;
    allocatedReferenceUploadKey = referenceUploadKey;
    // The RPC consumes the upload it resolved, so a request that named one and
    // came back without a key means the reference was silently dropped.
    if (Boolean(body.referenceUploadId) !== Boolean(referenceUploadKey)) {
      throw new HttpError(409, "reference_upload_unresolved", "The uploaded reference could not be attached to this generation.");
    }
    const { data: claimed, error: claimError } = await admin.rpc("claim_generation", { p_generation_id: generationId, p_user_id: user.id });
    if (claimError || !claimed?.[0]) throw new HttpError(409, "generation_already_started", "Generation is already running.");
    const running = claimed[0] as RunningGeneration;
    await admin.from("analytics_events").insert({ user_id: user.id, artwork_id: running.artwork_id, purchase_id: running.purchase_id, event_name: "generation_requested" });
    EdgeRuntime.waitUntil(runGeneration(generationId, user.id, running, providerPrompt, referenceUploadKey));
    allocatedGenerationId = null;
    allocatedReferenceUploadKey = null;
    return privateJson({ generationId, status: "running", statusUrl: `/functions/v1/generation-status?generationId=${encodeURIComponent(generationId)}` }, 202);
  } catch (error) {
    if (allocatedGenerationId) await release(allocatedGenerationId, "failed", "worker_start_failed");
    await discardReferenceUpload(allocatedReferenceUploadKey);
    return respondError(error);
  }
});

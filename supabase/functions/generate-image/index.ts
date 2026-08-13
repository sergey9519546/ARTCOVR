import { preflight } from "../_shared/cors.ts";
import { HttpError, privateJson, respondError } from "../_shared/errors.ts";
import { editImage, imageModel } from "../_shared/openai-images.ts";
import { postgresHttpError } from "../_shared/postgres-errors.ts";
import { admin, readJson, requireUser } from "../_shared/supabase.ts";
import { downloadPrivate, outputKeys, removePrivate, signPrivate, uploadPrivate } from "../_shared/storage.ts";
import { rasterizePreview } from "../_shared/watermark.ts";

type RequestBody = {
  artworkId?: string;
  purchaseId?: string | null;
  referenceGenerationId?: string | null;
  resetToBase?: boolean;
  prompt?: string;
};
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function release(id: string, status: "blocked" | "failed" | "timed_out", code: string) {
  await admin.rpc("release_generation_allowance", { p_generation_id: id, p_status: status, p_error_code: code });
}

async function runGeneration(generationId: string, userId: string, running: { artwork_id: string; purchase_id: string | null; prompt: string; source_object_key: string }) {
  const keys = outputKeys(running.artwork_id, generationId);
  const uploaded: string[] = [];
  let finalized = false;
  try {
    const source = await downloadPrivate(running.source_object_key);
    const result = await editImage(source, running.prompt, Boolean(running.purchase_id));
    await uploadPrivate(keys.clean, result.bytes);
    uploaded.push(keys.clean);
    const cleanForRenderer = await signPrivate(keys.clean, 60);
    const watermarked = await rasterizePreview(cleanForRenderer, running.purchase_id ? 2048 : 1024);
    await uploadPrivate(keys.preview, watermarked);
    uploaded.push(keys.preview);
    const { data: completed, error: completeError } = await admin.rpc("complete_generation", {
      p_generation_id: generationId, p_preview_object_key: keys.preview, p_clean_object_key: keys.clean,
      p_openai_request_id: result.requestId, p_usage: result.usage,
    });
    if (completeError || !completed) throw new HttpError(409, "generation_finalize_failed", "Generation could not be finalized.");
    finalized = true;
    await admin.from("analytics_events").insert({ user_id: userId, artwork_id: running.artwork_id, purchase_id: running.purchase_id, event_name: "generation_completed" });
  } catch (error) {
    const known = error instanceof HttpError ? error.code : "generation_failed";
    if (!finalized) await removePrivate(uploaded);
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
  try {
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const user = await requireUser(request);
    const body = await readJson<RequestBody>(request);
    if (!body.artworkId || !body.prompt) throw new HttpError(400, "invalid_request", "artworkId and prompt are required.");
    const { data: created, error: createError } = await admin.rpc("request_generation", {
      p_catalog_id: body.artworkId, p_user_id: user.id, p_purchase_id: body.purchaseId ?? null,
      p_reference_generation_id: body.referenceGenerationId ?? null, p_prompt: body.prompt,
      p_openai_model: imageModel, p_reset_to_base: body.resetToBase === true,
    });
    if (createError) {
      throw postgresHttpError(createError, {
        status: 409,
        code: "generation_unavailable",
        message: "Image generation is not currently available for this artwork.",
      });
    }
    const job = created?.[0] as { generation_id: string; source_object_key: string } | undefined;
    if (!job) throw new HttpError(409, "generation_unavailable", "No generation allowance is available.");
    const generationId = job.generation_id;
    allocatedGenerationId = generationId;
    const { data: claimed, error: claimError } = await admin.rpc("claim_generation", { p_generation_id: generationId, p_user_id: user.id });
    if (claimError || !claimed?.[0]) throw new HttpError(409, "generation_already_started", "Generation is already running.");
    const running = claimed[0] as { artwork_id: string; purchase_id: string | null; prompt: string; source_object_key: string };
    await admin.from("analytics_events").insert({ user_id: user.id, artwork_id: running.artwork_id, purchase_id: running.purchase_id, event_name: "generation_requested" });
    EdgeRuntime.waitUntil(runGeneration(generationId, user.id, running));
    allocatedGenerationId = null;
    return privateJson({ generationId, status: "running", statusUrl: `/functions/v1/generation-status?generationId=${encodeURIComponent(generationId)}` }, 202);
  } catch (error) {
    if (allocatedGenerationId) await release(allocatedGenerationId, "failed", "worker_start_failed");
    return respondError(error);
  }
});

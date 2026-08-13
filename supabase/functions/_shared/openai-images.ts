import { HttpError } from "./errors.ts";
import { RasterValidationError, validateSquareWebp } from "./raster.ts";

const endpoint = "https://api.openai.com/v1/images/edits";
const apiKey = Deno.env.get("OPENAI_API_KEY");
export const imageModel = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-2-2026-04-21";

type EditResult = { bytes: Uint8Array; requestId: string | null; usage: Record<string, unknown> };

const maximumOutputBytes = 20 * 1024 * 1024;

function timeoutMilliseconds() {
  const configured = Number(Deno.env.get("OPENAI_IMAGE_TIMEOUT_MS") ?? "115000");
  return Number.isFinite(configured) && configured >= 30_000 && configured <= 135_000
    ? Math.trunc(configured)
    : 115_000;
}

async function providerError(response: Response) {
  let providerCode = "unknown";
  let providerType = "unknown";
  try {
    const payload = await response.json() as {
      error?: { code?: string; type?: string };
    };
    providerCode = payload.error?.code ?? providerCode;
    providerType = payload.error?.type ?? providerType;
  } catch {
    // A non-JSON upstream failure is still classified by HTTP status below.
  }
  console.error("OpenAI image edit rejected", {
    status: response.status,
    providerCode,
    providerType,
    requestId: response.headers.get("x-request-id"),
  });

  const moderationCodes = new Set([
    "content_policy_violation",
    "image_generation_user_error",
    "moderation_blocked",
    "safety_system_rejection",
  ]);
  const policyFingerprint = `${providerCode} ${providerType}`.toLowerCase();
  if (moderationCodes.has(providerCode)
    || policyFingerprint.includes("moderation")
    || policyFingerprint.includes("content_policy")
    || policyFingerprint.includes("safety")) {
    return new HttpError(422, "generation_blocked", "The image request could not be processed under the safety policy.");
  }
  if (response.status === 429) {
    return new HttpError(503, "openai_rate_limited", "Image generation is temporarily busy. Try again shortly.");
  }
  if (response.status >= 500) {
    return new HttpError(503, "openai_unavailable", "The image service is temporarily unavailable.");
  }
  return new HttpError(502, "openai_request_rejected", "The image service rejected the server request.");
}

export async function editImage(source: Blob, prompt: string, purchased: boolean): Promise<EditResult> {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  const form = new FormData();
  form.set("model", imageModel);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("quality", purchased ? "high" : "medium");
  form.set("size", purchased ? "2048x2048" : "1024x1024");
  form.set("output_format", "webp");
  form.set("image[]", new File([source], "source.png", { type: source.type || "image/png" }));
  const controller = new AbortController();
  const timeoutMs = timeoutMilliseconds();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "generation_timed_out", "Image generation exceeded the server time limit.");
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (!response.ok) {
    throw await providerError(response);
  }
  const payload = await response.json().catch(() => null);
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new HttpError(502, "openai_invalid_response", "Image API returned no raster output.");
  if (b64.length > Math.ceil(maximumOutputBytes / 3) * 4 + 8) {
    throw new HttpError(502, "openai_output_too_large", "Image API returned an oversized raster output.");
  }
  let binary: Uint8Array;
  try {
    binary = Uint8Array.from(atob(b64), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(502, "openai_invalid_base64", "Image API returned malformed raster data.");
  }
  try {
    validateSquareWebp(binary, purchased ? 2048 : 1024, maximumOutputBytes);
  } catch (error) {
    if (error instanceof RasterValidationError) {
      console.error("OpenAI raster validation failed", {
        reason: error.reason,
        requestId: response.headers.get("x-request-id"),
      });
      throw new HttpError(502, "openai_invalid_raster", "Image API returned an invalid raster output.");
    }
    throw error;
  }
  return { bytes: binary, requestId: response.headers.get("x-request-id"), usage: payload.usage ?? {} };
}

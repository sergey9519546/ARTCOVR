import { HttpError } from "./errors.ts";
import { RasterValidationError, validateSquareWebp } from "./raster.ts";

// `OPENAI_IMAGES_ENDPOINT` overrides the image-edit host for any provider.
// The default is direct OpenAI; set this to `https://api.x.ai/v1/images/edits`
// to route through xAI's grok-imagine adapter instead. The Vercel AI Gateway
// (`ai-gateway.vercel.sh/v1/images/edits`) does NOT proxy image *edits* (only
// `/v1/images/generations` for text-to-image), so it must never be the default.
const endpoint =
  Deno.env.get("OPENAI_IMAGES_ENDPOINT") ??
  "https://api.openai.com/v1/images/edits";
const apiKey = Deno.env.get("OPENAI_API_KEY");
export const imageModel = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-2-2026-04-21";

// `IMAGE_PROVIDER` forces the request/response wire shape (`"openai"` multipart
// form-data vs `"xai"` JSON with a base64 data-URI image). When unset the host
// of `OPENAI_IMAGES_ENDPOINT` selects it (`api.x.ai` -> xai, otherwise openai).
type ImageProvider = "openai" | "xai";
const provider: ImageProvider = (() => {
  const explicit = Deno.env.get("IMAGE_PROVIDER")?.toLowerCase();
  if (explicit === "xai" || explicit === "openai") return explicit;
  try {
    const host = new URL(endpoint).host;
    return host === "api.x.ai" || host.endsWith(".x.ai") ? "xai" : "openai";
  } catch {
    return "openai";
  }
})();

type EditResult = { bytes: Uint8Array; requestId: string | null; usage: Record<string, unknown> };

const maximumOutputBytes = 20 * 1024 * 1024;

// The generation watchdog reaps queued/running rows after 180 seconds. The
// provider budget must stay strictly below that cutoff once the 15-second
// watermark render and a 30-second finalization margin are added, otherwise the
// reaper releases the allowance of a job its own worker is still running.
export const maximumImageTimeoutMs = 130_000;

function timeoutMilliseconds() {
  const configured = Number(Deno.env.get("OPENAI_IMAGE_TIMEOUT_MS") ?? "115000");
  return Number.isFinite(configured) && configured >= 30_000 && configured <= maximumImageTimeoutMs
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

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

async function blobToBase64DataUri(source: Blob): Promise<string> {
  const mime = source.type || "image/png";
  const bytes = new Uint8Array(await source.arrayBuffer());
  return `data:${mime};base64,${base64EncodeBytes(bytes)}`;
}

async function downloadImageBytes(url: string): Promise<{ bytes: Uint8Array; requestId: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds());
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "generation_timed_out", "Image generation exceeded the server time limit.");
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (!response.ok || !response.body) {
    throw new HttpError(502, "openai_invalid_response", "Image API returned no raster output.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumOutputBytes) {
      throw new HttpError(502, "openai_output_too_large", "Image API returned an oversized raster output.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const piece of chunks) {
    bytes.set(piece, offset);
    offset += piece.byteLength;
  }
  return { bytes, requestId: response.headers.get("x-request-id") };
}

function decodeB64Json(b64: string): Uint8Array {
  if (b64.length > Math.ceil(maximumOutputBytes / 3) * 4 + 8) {
    throw new HttpError(502, "openai_output_too_large", "Image API returned an oversized raster output.");
  }
  try {
    return Uint8Array.from(atob(b64), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(502, "openai_invalid_base64", "Image API returned malformed raster data.");
  }
}

async function editImageOpenai(source: Blob, prompt: string, purchased: boolean): Promise<EditResult> {
  const form = new FormData();
  form.set("model", imageModel);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("quality", purchased ? "high" : "medium");
  form.set("size", purchased ? "2048x2048" : "1024x1024");
  form.set("output_format", "webp");
  form.set("image[]", new File([source], "source.png", { type: source.type || "image/png" }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds());
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "generation_timed_out", "Image generation exceeded the server time limit.");
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw await providerError(response);
  const payload = await response.json().catch(() => null);
  const b64 = payload?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new HttpError(502, "openai_invalid_response", "Image API returned no raster output.");
  return { bytes: decodeB64Json(b64), requestId: response.headers.get("x-request-id"), usage: payload?.usage ?? {} };
}

async function editImageXai(source: Blob, prompt: string, purchased: boolean): Promise<EditResult> {
  // xAI's /v1/images/edits accepts a JSON body with the source image as a
  // base64 data-URI (`image.url`) rather than multipart form-data. It returns
  // `data[0].url` by default; requesting `response_format: "b64_json"` avoids a
  // second round-trip when the provider honors it, otherwise we download the
  // URL. `output_format: "webp"` is passed best-effort so the clean deliverable
  // stays a square WebP — if xAI ignores it the shared validator rejects the
  // raster before it ever reaches storage.
  const dataUri = await blobToBase64DataUri(source);
  const body = {
    model: imageModel,
    prompt,
    n: 1,
    image: { url: dataUri },
    size: purchased ? "2048x2048" : "1024x1024",
    quality: purchased ? "high" : "medium",
    output_format: "webp",
    response_format: "b64_json",
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds());
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "generation_timed_out", "Image generation exceeded the server time limit.");
    }
    throw error;
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw await providerError(response);
  const payload = await response.json().catch(() => null);
  const item = payload?.data?.[0];
  const requestId = response.headers.get("x-request-id") ?? (typeof payload?.id === "string" ? payload.id : null);
  const b64 = typeof item?.b64_json === "string" ? item.b64_json : null;
  if (b64) return { bytes: decodeB64Json(b64), requestId, usage: payload?.usage ?? {} };
  const url = typeof item?.url === "string" ? item.url : null;
  if (!url) throw new HttpError(502, "openai_invalid_response", "Image API returned no raster output.");
  const downloaded = await downloadImageBytes(url);
  return { bytes: downloaded.bytes, requestId: downloaded.requestId ?? requestId, usage: payload?.usage ?? {} };
}

export async function editImage(source: Blob, prompt: string, purchased: boolean): Promise<EditResult> {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");
  const result = provider === "xai"
    ? await editImageXai(source, prompt, purchased)
    : await editImageOpenai(source, prompt, purchased);
  try {
    validateSquareWebp(result.bytes, purchased ? 2048 : 1024, maximumOutputBytes);
  } catch (error) {
    if (error instanceof RasterValidationError) {
      console.error(`${provider} raster validation failed`, {
        reason: error.reason,
        requestId: result.requestId,
      });
      throw new HttpError(502, "openai_invalid_raster", "Image API returned an invalid raster output.");
    }
    throw error;
  }
  return result;
}

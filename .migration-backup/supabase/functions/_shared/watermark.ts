import { HttpError } from "./errors.ts";
import { RasterValidationError, validateSquareWebp } from "./raster.ts";

// Deploy a Cloudflare Images/Worker endpoint that fetches a short-lived signed
// source URL, applies a visible raster watermark, and returns WebP bytes.
// A missing renderer is intentionally an error: clean originals must never be
// repurposed as previews.
export async function rasterizePreview(
  cleanSignedUrl: string,
  expectedSize: 1024 | 2048,
): Promise<Uint8Array> {
  const renderer = Deno.env.get("WATERMARK_RENDER_URL");
  const token = Deno.env.get("WATERMARK_RENDER_TOKEN");
  if (!renderer || !token) throw new HttpError(500, "watermark_not_configured", "Raster watermark renderer is not configured.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(renderer, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: cleanSignedUrl, watermark: "ARTCOVR • PREVIEW", outputFormat: "webp" }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new HttpError(504, "watermark_timed_out", "Raster watermark rendering timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/webp")) {
    throw new HttpError(502, "watermark_failed", "Raster watermark renderer failed.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 20 * 1024 * 1024) {
    throw new HttpError(502, "watermark_output_too_large", "Raster watermark output exceeds the storage safety limit.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    validateSquareWebp(bytes, expectedSize);
  } catch (error) {
    if (error instanceof RasterValidationError) {
      console.error("Watermark raster validation failed", { reason: error.reason });
      throw new HttpError(502, "watermark_invalid_raster", "Raster watermark renderer returned invalid image data.");
    }
    throw error;
  }
  return bytes;
}

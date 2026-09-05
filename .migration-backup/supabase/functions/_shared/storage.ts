import { admin } from "./supabase.ts";
import { HttpError } from "./errors.ts";

export const ASSET_BUCKET = "art-assets";

/**
 * Formats a provider can return for the CLEAN output. The preview is always the
 * watermark renderer's WebP regardless of provider.
 */
export type GeneratedImageFormat = "webp" | "png" | "jpeg";

export function mimeTypeFor(format: GeneratedImageFormat): string {
  return format === "png" ? "image/png" : format === "jpeg" ? "image/jpeg" : "image/webp";
}

export function outputKeys(artworkId: string, generationId: string, cleanFormat: GeneratedImageFormat = "webp") {
  const root = `generated/${artworkId}/${generationId}`;
  return { preview: `${root}/preview-watermarked.webp`, clean: `${root}/clean.${cleanFormat}` };
}

/**
 * Every object key a generation could have written, across all clean formats.
 * Cleanup paths that cannot know which format the provider returned (the
 * watchdog reaps rows whose worker died before recording anything) must sweep
 * all of them; removePrivate tolerates keys that never existed.
 */
export function allOutputKeys(artworkId: string, generationId: string): string[] {
  const root = `generated/${artworkId}/${generationId}`;
  return [
    `${root}/preview-watermarked.webp`,
    `${root}/clean.webp`,
    `${root}/clean.png`,
    `${root}/clean.jpeg`,
  ];
}

export async function downloadPrivate(path: string): Promise<Blob> {
  const { data, error } = await admin.storage.from(ASSET_BUCKET).download(path);
  if (error || !data) throw new HttpError(502, "asset_unavailable", "Source image could not be read.");
  if (data.size > 20 * 1024 * 1024) throw new HttpError(413, "source_too_large", "Source image exceeds the private bucket safety limit.");
  return data;
}

export async function uploadPrivate(path: string, bytes: Uint8Array, contentType = "image/webp") {
  const { error } = await admin.storage.from(ASSET_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new HttpError(502, "asset_write_failed", "Generated image could not be stored.");
}

export async function removePrivate(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(ASSET_BUCKET).remove(paths);
  if (error) {
    // Cleanup is best-effort and must not replace the original worker error.
    console.error("Private asset cleanup failed", { paths, message: error.message });
  }
}

export async function signPrivate(path: string, expiresIn: number) {
  const { data, error } = await admin.storage.from(ASSET_BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new HttpError(502, "asset_sign_failed", "Asset URL could not be created.");
  return data.signedUrl;
}

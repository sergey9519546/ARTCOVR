import { admin } from "./supabase.ts";
import { HttpError } from "./errors.ts";

export const ASSET_BUCKET = "art-assets";

export function outputKeys(artworkId: string, generationId: string) {
  const root = `generated/${artworkId}/${generationId}`;
  return { preview: `${root}/preview-watermarked.webp`, clean: `${root}/clean.webp` };
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

import sharp, { type Metadata, type Sharp } from "sharp";
import { createHash } from "node:crypto";
import {
  editImageWithMetadata,
  type ImageEditClient,
} from "@workspace/integrations-openai-ai-server/image";
import { downloadPrivate, uploadPrivate } from "./mediaStorage";

export const acceptedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const maxReferenceBytes = 8 * 1024 * 1024;
const maxReferencePixels = 16_000_000;

export class ImagePipelineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function inspectReference(
  bytes: Uint8Array,
  declaredType: string,
) {
  if (!bytes.length)
    throw new ImagePipelineError(
      "invalid_reference_image",
      "The uploaded reference image is empty.",
    );
  if (bytes.length > maxReferenceBytes)
    throw new ImagePipelineError(
      "reference_too_large",
      "Reference images must be 8 MB or smaller.",
    );
  let image: Sharp;
  let metadata: Metadata;
  try {
    image = sharp(bytes, {
      animated: false,
      limitInputPixels: maxReferencePixels,
    });
    metadata = await image.metadata();
  } catch {
    throw new ImagePipelineError(
      "invalid_reference_image",
      "The uploaded bytes are not a valid still image.",
    );
  }
  if (
    (metadata.pages ?? 1) > 1 ||
    !metadata.width ||
    !metadata.height ||
    metadata.width < 256 ||
    metadata.height < 256
  ) {
    throw new ImagePipelineError(
      "invalid_reference_image",
      "Reference images must be at least 256px on every side and not animated.",
    );
  }
  const actual =
    metadata.format === "jpeg"
      ? "image/jpeg"
      : metadata.format === "png"
        ? "image/png"
        : metadata.format === "webp"
          ? "image/webp"
          : "";
  if (actual !== declaredType)
    throw new ImagePipelineError(
      "reference_type_mismatch",
      "The file contents do not match its declared type.",
    );
  const normalized = await image
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
  const normalizedMeta = await sharp(normalized).metadata();
  return {
    bytes: new Uint8Array(normalized),
    width: normalizedMeta.width ?? 0,
    height: normalizedMeta.height ?? 0,
    sha256: createHash("sha256").update(normalized).digest("hex"),
  };
}

export async function ensureBaseObject(artworkId: string, slug: string) {
  const key = `artworks/base/${artworkId}.jpg`;
  try {
    await downloadPrivate(key);
  } catch {
    const { readFile } = await import("node:fs/promises");
    // Source is src/lib/imagePipeline.ts; the deployed bundle is dist/index.mjs.
    // Resolve relative to the module so starting from the workspace root is safe.
    let bytes: Buffer;
    try {
      bytes = await readFile(
        new URL(
          `../../../artcovr/public/assets/artworks/${slug}.jpg`,
          import.meta.url,
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      bytes = await readFile(
        new URL(
          `../../artcovr/public/assets/artworks/${slug}.jpg`,
          import.meta.url,
        ),
      );
    }
    await uploadPrivate(key, new Uint8Array(bytes), "image/jpeg");
  }
  return key;
}

export async function createImageEditResult(
  artworkReference: Uint8Array,
  prompt: string,
  size: 1024 | 2048,
  identityReference?: Uint8Array,
  artworkContentType: "image/jpeg" | "image/webp" = "image/jpeg",
  client?: ImageEditClient,
) {
  const edited = await editImageWithMetadata(
    [
      {
        bytes: artworkReference,
        filename:
          artworkContentType === "image/webp"
            ? "artwork-reference.webp"
            : "artwork-reference.jpg",
        contentType: artworkContentType,
      },
      ...(identityReference
        ? [
            {
              bytes: identityReference,
              filename: "uploaded-identity-reference.webp",
              contentType: "image/webp" as const,
            },
          ]
        : []),
    ],
    prompt,
    client,
    { size },
  );
  const result = await sharp(edited.bytes, { limitInputPixels: 16_777_216 })
    .resize(size, size, { fit: "cover" })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
  return { ...edited, bytes: new Uint8Array(result) };
}

export async function addWatermark(bytes: Uint8Array, size: 1024 | 2048) {
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}"><style>text{font:700 ${Math.max(22, Math.floor(size / 28))}px sans-serif;letter-spacing:4px}</style><text x="${size / 2}" y="${size - 42}" fill="white" fill-opacity=".86" text-anchor="middle">ARTCOVR • PREVIEW</text></svg>`,
  );
  const result = await sharp(bytes)
    .composite([{ input: svg }])
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
  return new Uint8Array(result);
}

import { APIConnectionTimeoutError, toFile, type OpenAI } from "openai";
import type { ImageEditParamsNonStreaming } from "openai/resources/images";
import { getOpenAI } from "../client";

export type ImageEditInput = {
  bytes: Uint8Array;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export type ImageEditClient = Pick<OpenAI, "images">;

export class ImageProviderError extends Error {
  constructor(public readonly code: "provider_timeout" | "provider_failed" | "invalid_provider_image", message: string) {
    super(message);
    this.name = "ImageProviderError";
  }
}

function decodeImage(imageBase64: unknown) {
  // Buffer.from(..., "base64") silently accepts malformed input. Reject it so
  // an empty/invalid provider response never becomes a completed generation.
  if (typeof imageBase64 !== "string" || !imageBase64.length || imageBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64)) {
    throw new ImageProviderError("invalid_provider_image", "The image editing provider returned no valid image data.");
  }
  const bytes = Buffer.from(imageBase64, "base64");
  if (!bytes.length || bytes.toString("base64") !== imageBase64) {
    throw new ImageProviderError("invalid_provider_image", "The image editing provider returned no valid image data.");
  }
  return bytes;
}

export async function editImageWithMetadata(
  imageInputs: readonly ImageEditInput[],
  prompt: string,
  client?: ImageEditClient,
  options: { size?: 1024 | 2048 } = {},
) {
  if (imageInputs.length === 0 || imageInputs.some((input) => !input.bytes.length)) {
    throw new Error("At least one image reference is required.");
  }
  if (!prompt.trim()) throw new Error("An image editing instruction is required.");

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2";
  const isImage2 = model === "gpt-image-2" || model.startsWith("gpt-image-2-");
  const isImage1 = /^(?:gpt-image-1(?:\.5)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
  if (!isImage2 && !isImage1) throw new Error("Configure a supported GPT Image editing model.");
  const size = options.size ?? 1024;
  if (size !== 1024 && size !== 2048) throw new Error("Image edits must use a supported square size.");
  if (size === 2048 && !isImage2) throw new Error("Native 2048px editing requires GPT Image 2.");

  const images = await Promise.all(
    imageInputs.map((input) =>
      toFile(Buffer.from(input.bytes), input.filename, {
        type: input.contentType,
      }),
    ),
  );
  const request: ImageEditParamsNonStreaming = {
    model,
    image: images,
    prompt,
    // GPT Image 2 supports 2048x2048; the pinned SDK predates its size union.
    // Keep this API compatibility assertion at the provider boundary only.
    size: `${size}x${size}` as ImageEditParamsNonStreaming["size"],
    quality: "high",
    n: 1,
    output_format: "png",
    ...(isImage1 ? { input_fidelity: "high" as const } : {}),
  };
  const imageClient = client ?? getOpenAI();
  let response;
  try {
    response = await imageClient.images.edit(request);
  } catch (error) {
    // Provider messages may echo credentials, input text, or request bodies.
    // Preserve only a safe category, never the raw error or a nested cause.
    if (error instanceof APIConnectionTimeoutError ||
        (error instanceof Error && ["APIConnectionTimeoutError", "TimeoutError", "AbortError"].includes(error.name))) {
      throw new ImageProviderError("provider_timeout", "The image editing provider timed out. Please try again.");
    }
    throw new ImageProviderError("provider_failed", "The image editing provider could not complete this edit. Please try again.");
  }
  return {
    bytes: decodeImage(response.data?.[0]?.b64_json),
    model,
    requestId: (response as typeof response & { _request_id?: string })._request_id ?? null,
    usage: response.usage,
  };
}

export async function editImageBuffers(imageInputs: readonly ImageEditInput[], prompt: string, client?: ImageEditClient) {
  return (await editImageWithMetadata(imageInputs, prompt, client)).bytes;
}

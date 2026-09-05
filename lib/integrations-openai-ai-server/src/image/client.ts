import { toFile, type OpenAI } from "openai";
import { openai } from "../client";

export type ImageEditInput = {
  bytes: Uint8Array;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

export type ImageEditClient = Pick<OpenAI, "images">;

export async function editImageBuffers(
  imageInputs: readonly ImageEditInput[],
  prompt: string,
  client: ImageEditClient = openai,
): Promise<Buffer> {
  if (imageInputs.length === 0) {
    throw new Error("At least one image reference is required.");
  }

  const images = await Promise.all(
    imageInputs.map((input) =>
      toFile(Buffer.from(input.bytes), input.filename, {
        type: input.contentType,
      }),
    ),
  );
  const response = await client.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt,
    size: "1024x1024",
  });
  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  if (!imageBase64) {
    throw new Error("The image editing provider returned no image.");
  }
  return Buffer.from(imageBase64, "base64");
}
import assert from "node:assert/strict";
import test from "node:test";
import { editImageBuffers, type ImageEditClient } from "@workspace/integrations-openai-ai-server/image";

test("sends the artwork first and an uploaded identity reference second", async () => {
  let request: { image?: unknown[]; prompt?: string } | undefined;
  const client = {
    images: {
      edit: async (input: { image: unknown[]; prompt: string }) => {
        request = input;
        return { data: [{ b64_json: Buffer.from("edited-image").toString("base64") }] };
      },
    },
  } as unknown as ImageEditClient;

  const result = await editImageBuffers(
    [
      { bytes: new Uint8Array([1, 2, 3]), filename: "artwork-reference.jpg", contentType: "image/jpeg" },
      { bytes: new Uint8Array([4, 5, 6]), filename: "uploaded-identity-reference.webp", contentType: "image/webp" },
    ],
    "Place the person from the second image naturally into the artwork.",
    client,
  );

  assert.equal(result.toString(), "edited-image");
  assert.equal(request?.prompt, "Place the person from the second image naturally into the artwork.");
  assert.equal(request?.image?.length, 2);
  assert.equal((request?.image?.[0] as { name?: string }).name, "artwork-reference.jpg");
  assert.equal((request?.image?.[1] as { name?: string }).name, "uploaded-identity-reference.webp");
});
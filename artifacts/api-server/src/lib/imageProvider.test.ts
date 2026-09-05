import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { getOpenAI } from "@workspace/integrations-openai-ai-server";
import {
  editImageBuffers,
  editImageWithMetadata,
  ImageProviderError,
  type ImageEditClient,
  type ImageEditInput,
} from "@workspace/integrations-openai-ai-server/image";

type RecordedRequest = {
  image: File[];
  prompt: string;
  model: string;
  size: string;
  n: number;
  quality: string;
  input_fidelity?: string;
  output_format: string;
};

const artwork: ImageEditInput = {
  bytes: new Uint8Array([1, 2, 3]),
  filename: "artwork-reference.jpg",
  contentType: "image/jpeg",
};
const identity: ImageEditInput = {
  bytes: new Uint8Array([4, 5, 6]),
  filename: "uploaded-identity-reference.webp",
  contentType: "image/webp",
};
const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9sAAAAASUVORK5CYII=", "base64");

function stubProvider(result: unknown = { data: [{ b64_json: imageBytes.toString("base64") }] }) {
  const calls: RecordedRequest[] = [];
  const client = {
    images: {
      edit: async (request: RecordedRequest) => {
        calls.push(request);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  } as unknown as ImageEditClient;
  return { client, calls };
}

function image2(t: TestContext) {
  const prior = process.env.OPENAI_IMAGE_MODEL;
  delete process.env.OPENAI_IMAGE_MODEL;
  t.after(() => {
    if (prior === undefined) delete process.env.OPENAI_IMAGE_MODEL;
    else process.env.OPENAI_IMAGE_MODEL = prior;
  });
}

test("sends artwork bytes first and identity photo bytes second with GPT Image 2 editing options", async (t) => {
  image2(t);
  const usage = { input_tokens: 10, output_tokens: 20, total_tokens: 30 };
  const { client, calls } = stubProvider({
    data: [{ b64_json: imageBytes.toString("base64") }],
    _request_id: "req_reference_edit",
    usage,
  });
  const prompt = "Place the person from the second image naturally into the artwork.";
  const result = await editImageWithMetadata([artwork, identity], prompt, client, { size: 2048 });

  assert.equal(calls.length, 1);
  const request = calls[0]!;
  assert.equal(request.prompt, prompt);
  assert.equal(request.model, "gpt-image-2");
  assert.equal(request.size, "2048x2048");
  assert.equal(request.quality, "high");
  assert.equal(request.n, 1);
  assert.equal(request.output_format, "png");
  assert.equal("input_fidelity" in request, false, "GPT Image 2 does not accept input_fidelity");
  assert.equal(request.image.length, 2);
  for (const [index, expected] of [artwork, identity].entries()) {
    const file = request.image[index]!;
    assert.equal(file.name, expected.filename);
    assert.equal(file.type, expected.contentType);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), expected.bytes);
  }
  assert.deepEqual(result.bytes, imageBytes);
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.requestId, "req_reference_edit");
  assert.deepEqual(result.usage, usage);
});

test("text-only direction still sends the mandatory artwork image", async (t) => {
  image2(t);
  const { client, calls } = stubProvider();
  const result = await editImageBuffers([artwork], "Add a red moon.", client);
  assert.deepEqual(result, imageBytes);
  assert.equal(calls[0]!.size, "1024x1024");
  assert.equal(calls[0]!.image.length, 1);
  assert.deepEqual(new Uint8Array(await calls[0]!.image[0]!.arrayBuffer()), artwork.bytes);
});

test("missing or empty primary image cannot become a text-only model request", async () => {
  const { client, calls } = stubProvider();
  for (const inputs of [[], [{ ...artwork, bytes: new Uint8Array() }], [{ ...artwork, bytes: new Uint8Array() }, identity]]) {
    await assert.rejects(editImageWithMetadata(inputs, "Add a person.", client), /image reference is required/);
  }
  await assert.rejects(editImageWithMetadata([artwork], " \n ", client), /instruction is required/);
  assert.equal(calls.length, 0);
});

test("missing, URL-only, empty and malformed base64 outputs are failures", async (t) => {
  image2(t);
  for (const response of [
    {},
    { data: [] },
    { data: [{ url: "https://example.invalid/result.png" }] },
    { data: [{ b64_json: "" }] },
    { data: [{ b64_json: "%%%=" }] },
    { data: [{ b64_json: "AAAA====" }] },
    { data: [{ b64_json: "AB==" }] },
  ]) {
    const { client, calls } = stubProvider(response);
    await assert.rejects(editImageWithMetadata([artwork], "Edit the cover.", client),
      (error: unknown) => error instanceof ImageProviderError && error.code === "invalid_provider_image");
    assert.equal(calls.length, 1);
  }
});

test("large image output decodes without a recursive base64 regular expression", async (t) => {
  image2(t);
  const bytes = Buffer.alloc(3 * 1024 * 1024, 0xaa);
  const { client } = stubProvider({ data: [{ b64_json: bytes.toString("base64") }] });
  const result = await editImageBuffers([artwork], "Edit the cover.", client);
  assert.deepEqual(result, bytes);
});

test("provider errors and timeouts fail once without leaking response secrets", async (t) => {
  image2(t);
  for (const name of ["Error", "APIConnectionTimeoutError", "AbortError", "TimeoutError"]) {
    const original = new Error("Provider rejected fake-secret-do-not-echo and private request text");
    original.name = name;
    const { client, calls } = stubProvider(original);
    await assert.rejects(editImageWithMetadata([artwork], "Edit the cover.", client), (error: unknown) => {
      assert.ok(error instanceof ImageProviderError);
      assert.equal(error.code, name === "Error" ? "provider_failed" : "provider_timeout");
      assert.doesNotMatch(error.message, /fake-secret|private request/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test("direct credentials use only the official endpoint with bounded time and no retries", () => {
  const client = getOpenAI({
    OPENAI_API_KEY: "fake-direct-key",
    OPENAI_BASE_URL: "https://wrong-host.invalid/v1",
    AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key",
    AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/v1",
  });
  assert.equal(client.baseURL, "https://api.openai.com/v1");
  assert.equal(client.apiKey, "fake-direct-key");
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 150_000);
});

test("managed integration uses only its paired credentials and HTTPS endpoint", () => {
  const client = getOpenAI({
    AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key",
    AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/openai/v1/",
  });
  assert.equal(client.apiKey, "fake-managed-key");
  assert.equal(client.baseURL, "https://managed.invalid/openai/v1");
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 150_000);
  for (const endpoint of ["http://managed.invalid/v1", "broken", "https://user:password@managed.invalid/v1", "https://managed.invalid/v1?key=fake", "https://managed.invalid/v1#fragment"]) {
    assert.throws(() => getOpenAI({ AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key", AI_INTEGRATIONS_OPENAI_BASE_URL: endpoint }), /endpoint/);
  }
});

test("credential setup fails lazily and never mixes incomplete credential pairs", () => {
  for (const env of [{}, { AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key" }, { AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/v1" }]) {
    assert.throws(() => getOpenAI(env), /Image editing is not configured/);
  }
});

test("managed integration accepts Replit's exact local sidecar without forwarding direct credentials", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    const env = {
      REPL_ID: "fake-replit-runtime",
      AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key",
      AI_INTEGRATIONS_OPENAI_BASE_URL: `http://${hostname}:1106/openai/v1`,
    };
    const managed = getOpenAI(env);
    assert.equal(managed.baseURL, env.AI_INTEGRATIONS_OPENAI_BASE_URL);
    assert.equal(managed.apiKey, "fake-managed-key");
    assert.equal(managed.maxRetries, 0);
    const automaticallyManaged = getOpenAI({ ...env, OPENAI_API_KEY: "fake-direct-key" });
    assert.equal(automaticallyManaged.baseURL, env.AI_INTEGRATIONS_OPENAI_BASE_URL);
    assert.equal(automaticallyManaged.apiKey, "fake-managed-key");
    const direct = getOpenAI({ ...env, ARTCOVR_IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "fake-direct-key" });
    assert.equal(direct.baseURL, "https://api.openai.com/v1");
    assert.equal(direct.apiKey, "fake-direct-key");
  }
});

test("explicit provider selection uses only the chosen credential pair", () => {
  const env = {
    OPENAI_API_KEY: "fake-direct-key",
    AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key",
    AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/v1",
  };
  const replit = getOpenAI({ ...env, ARTCOVR_IMAGE_PROVIDER: "replit" });
  assert.equal(replit.baseURL, "https://managed.invalid/v1");
  assert.equal(replit.apiKey, "fake-managed-key");
  assert.equal(replit.timeout, 150_000);
  assert.equal(replit.maxRetries, 0);
  const direct = getOpenAI({ ...env, REPL_ID: "fake-replit-runtime", ARTCOVR_IMAGE_PROVIDER: "openai" });
  assert.equal(direct.baseURL, "https://api.openai.com/v1");
  assert.equal(direct.apiKey, "fake-direct-key");
  assert.equal(direct.timeout, 150_000);
  assert.equal(direct.maxRetries, 0);
  const automaticOutside = getOpenAI({ ...env, ARTCOVR_IMAGE_PROVIDER: "auto" });
  assert.equal(automaticOutside.baseURL, "https://api.openai.com/v1");
  assert.equal(automaticOutside.apiKey, "fake-direct-key");
  const automaticInside = getOpenAI({ ...env, REPL_ID: "fake-replit-runtime", ARTCOVR_IMAGE_PROVIDER: "auto" });
  assert.equal(automaticInside.baseURL, "https://managed.invalid/v1");
  assert.equal(automaticInside.apiKey, "fake-managed-key");
});

test("explicit modes fail closed when their credentials are missing without exposing values", () => {
  for (const env of [
    { ARTCOVR_IMAGE_PROVIDER: "openai", AI_INTEGRATIONS_OPENAI_API_KEY: "fake-secret-do-not-echo", AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/v1" },
    { ARTCOVR_IMAGE_PROVIDER: "replit", OPENAI_API_KEY: "fake-secret-do-not-echo" },
    { ARTCOVR_IMAGE_PROVIDER: "replit", OPENAI_API_KEY: "fake-direct-key", AI_INTEGRATIONS_OPENAI_API_KEY: "fake-secret-do-not-echo" },
    { ARTCOVR_IMAGE_PROVIDER: "fake-secret-do-not-echo", OPENAI_API_KEY: "fake-direct-key" },
  ]) {
    assert.throws(() => getOpenAI(env), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /fake-secret|fake-direct/);
      return true;
    });
  }
});

test("automatic mode does not select an incomplete managed pair over an available direct key", () => {
  for (const partial of [
    { AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key" },
    { AI_INTEGRATIONS_OPENAI_BASE_URL: "https://managed.invalid/v1" },
  ]) {
    const direct = getOpenAI({ ...partial, REPL_ID: "fake-replit-runtime", OPENAI_API_KEY: "fake-direct-key" });
    assert.equal(direct.baseURL, "https://api.openai.com/v1");
    assert.equal(direct.apiKey, "fake-direct-key");
  }
});

test("HTTP managed endpoints cannot escape the Replit loopback sidecar exception", () => {
  const managed = { AI_INTEGRATIONS_OPENAI_API_KEY: "fake-managed-key" };
  for (const baseURL of [
    "http://localhost:1106/openai/v1",
    "http://127.0.0.1:1106/openai/v1",
    "http://[::1]:1106/openai/v1",
  ]) {
    assert.throws(() => getOpenAI({ ...managed, AI_INTEGRATIONS_OPENAI_BASE_URL: baseURL }), /endpoint/);
    assert.throws(() => getOpenAI({ ...managed, REPL_ID: " ", AI_INTEGRATIONS_OPENAI_BASE_URL: baseURL }), /endpoint/);
  }
  for (const baseURL of [
    "http://remote.invalid:1106/openai/v1",
    "http://localhost.invalid:1106/openai/v1",
    "http://localhost:1107/openai/v1",
    "http://localhost/openai/v1",
    "http://user:password@localhost:1106/openai/v1",
    "http://localhost:1106/openai/v1?key=fake",
    "http://localhost:1106/openai/v1#fragment",
  ]) {
    assert.throws(() => getOpenAI({ ...managed, REPL_ID: "fake-replit-runtime", AI_INTEGRATIONS_OPENAI_BASE_URL: baseURL }), /endpoint/);
  }
});

test("the real SDK sends multipart image bytes and does not retry HTTP failures", async (t) => {
  image2(t);
  const requests: { url: string; init?: RequestInit }[] = [];
  const client = getOpenAI({ OPENAI_API_KEY: "fake-direct-key" }).withOptions({
    fetch: async (url, init) => {
      // The SDK probes custom fetch's FormData support with a data: URL.
      if (String(url) === "data:,") return new Response("");
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ error: { message: "fake-secret-do-not-echo", type: "server_error" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    },
  });
  await assert.rejects(editImageWithMetadata([artwork, identity], "Put me in the cover.", client, { size: 2048 }),
    (error: unknown) => error instanceof ImageProviderError && error.code === "provider_failed" && !error.message.includes("fake-secret"));
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.url, "https://api.openai.com/v1/images/edits");
  assert.equal(new Headers(request.init?.headers).get("authorization"), "Bearer fake-direct-key");
  assert.ok(request.init?.body instanceof FormData);
  assert.equal(request.init.body.get("model"), "gpt-image-2");
  assert.equal(request.init.body.get("size"), "2048x2048");
  assert.equal(request.init.body.get("input_fidelity"), null);
  const images = request.init.body.getAll("image[]");
  assert.equal(images.length, 2);
  for (const [index, input] of [artwork, identity].entries()) {
    const file = images[index];
    assert.ok(file instanceof File);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), input.bytes);
  }
});

test("the real SDK propagates a timeout without retrying a paid edit", async (t) => {
  image2(t);
  let requests = 0;
  const client = getOpenAI({ OPENAI_API_KEY: "fake-direct-key" }).withOptions({
    fetch: async (url) => {
      if (String(url) === "data:,") return new Response("");
      requests += 1;
      throw new DOMException("fake-secret-do-not-echo", "AbortError");
    },
  });
  await assert.rejects(editImageWithMetadata([artwork], "Edit the cover.", client),
    (error: unknown) => error instanceof ImageProviderError && error.code === "provider_timeout");
  assert.equal(requests, 1);
});

test("an explicitly configured older model is never silently upscaled to satisfy a 2048px request", async (t) => {
  image2(t);
  process.env.OPENAI_IMAGE_MODEL = "gpt-image-1.5";
  const { client, calls } = stubProvider();
  await assert.rejects(editImageWithMetadata([artwork], "Edit the cover.", client, { size: 2048 }), /requires GPT Image 2/);
  assert.equal(calls.length, 0);
  await editImageWithMetadata([artwork], "Edit the cover.", client);
  assert.equal(calls[0]!.model, "gpt-image-1.5");
  assert.equal(calls[0]!.input_fidelity, "high");
});

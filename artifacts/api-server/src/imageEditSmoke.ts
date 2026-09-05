import { open, readFile, stat, unlink } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

const help = `Run one real image edit through ARTCOVR's production image pipeline.

Usage (from the workspace root):
  pnpm --filter @workspace/api-server exec tsx src/imageEditSmoke.ts \\
    --source /absolute/path/to/cover.jpg \\
    --output /absolute/path/to/.local/edit-smoke.webp \\
    --prompt "Add a red moon while preserving the rest of the cover." \\
    [--reference /absolute/path/to/authorized-photo.jpg] [--size 1024|2048]

Required:
  --source PATH      Current artwork, in JPEG, PNG, or WebP format.
  --output PATH      A NEW .webp file. Its parent directory must already exist.
  --prompt TEXT      Editing instructions, sent as provided.

Optional:
  --reference PATH   An additional authorized photo/reference image (max 8 MB).
  --size SIZE        Square output size: 1024 (default) or 2048.
  --help, -h         Print this help without making a model request.

This opt-in command makes one paid provider request with existing server-side
credentials. It does not retry, call customer admission, access a database,
consume customer allowances, or upload media to object storage. It writes only
the explicit output file; keep outputs in an ignored private directory.
The artwork is always the first image and the additional reference is second.
Successful JSON output contains model, request ID, output dimensions and bytes.
Inspect the result visually: technical success does not prove edit quality.
`;

class SmokeError extends Error {}

async function loadImage(path: string, role: "source" | "reference") {
  let bytes: Buffer;
  try {
    const info = await stat(path);
    const maxBytes = role === "reference" ? 8 * 1024 * 1024 : 32 * 1024 * 1024;
    if (!info.isFile() || info.size === 0 || info.size > maxBytes) {
      throw new SmokeError(`The ${role} must be a nonempty image file within the ${role === "reference" ? "8" : "32"} MB limit.`);
    }
    bytes = await readFile(path);
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    throw new SmokeError(`Could not read the ${role} image file.`);
  }

  try {
    const metadata = await sharp(bytes, { animated: false, limitInputPixels: 16_000_000 }).metadata();
    const type = metadata.format === "jpeg" ? "image/jpeg"
      : metadata.format === "png" ? "image/png"
      : metadata.format === "webp" ? "image/webp" : undefined;
    if (!type || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height ||
        metadata.width < 256 || metadata.height < 256) {
      throw new SmokeError(`The ${role} must be a still JPEG, PNG, or WebP image at least 256px on each side.`);
    }
    return { bytes, type };
  } catch (error) {
    if (error instanceof SmokeError) throw error;
    throw new SmokeError(`The ${role} image could not be decoded or exceeds the 16 megapixel limit.`);
  }
}

export async function runImageEditSmoke(args = process.argv.slice(2)) {
  let outputPath: string | undefined;
  let output: Awaited<ReturnType<typeof open>> | undefined;
  let completed = false;
  try {
    let parsed;
    try {
      parsed = parseArgs({
        args,
        options: {
          source: { type: "string" },
          output: { type: "string" },
          prompt: { type: "string" },
          reference: { type: "string" },
          size: { type: "string", default: "1024" },
          help: { type: "boolean", short: "h" },
        },
        strict: true,
        allowPositionals: false,
      });
    } catch {
      throw new SmokeError("Invalid command arguments. Run with --help for usage.");
    }
    const values = parsed.values;
    if (values.help) {
      console.log(help);
      return 0;
    }
    if (!values.source?.trim() || !values.output?.trim() || !values.prompt?.trim()) {
      throw new SmokeError("Provide --source, --output, and --prompt. Run with --help for usage.");
    }
    if (values.prompt.length > 12_000) throw new SmokeError("The editing prompt must be 12,000 characters or fewer.");
    if (values.size !== "1024" && values.size !== "2048") throw new SmokeError("--size must be 1024 or 2048.");
    if (extname(values.output).toLowerCase() !== ".webp") throw new SmokeError("--output must name a new .webp file.");
    if (values.reference !== undefined && !values.reference.trim()) throw new SmokeError("--reference requires an image file path.");

    const size = values.size === "2048" ? 2048 : 1024;
    const source = await loadImage(resolve(values.source), "source");
    const reference = values.reference ? await loadImage(resolve(values.reference), "reference") : undefined;
    const { createImageEditResult, inspectReference } = await import("./lib/imagePipeline");
    const { getOpenAI } = await import("@workspace/integrations-openai-ai-server");
    const client = getOpenAI().withOptions({ logLevel: "off" });

    let sourceBytes: Buffer;
    let referenceBytes: Uint8Array | undefined;
    try {
      // Normalize orientation and format while preserving the source resolution.
      // Personal uploads follow the exact production normalization path.
      sourceBytes = await sharp(source.bytes, { animated: false, limitInputPixels: 16_000_000 })
        .rotate().webp({ quality: 95, effort: 4 }).toBuffer();
      referenceBytes = reference ? (await inspectReference(reference.bytes, reference.type)).bytes : undefined;
    } catch {
      throw new SmokeError("An input image failed normalization; no model request was made.");
    }

    outputPath = resolve(values.output);
    try {
      // Reserve the explicit target before spending on the model. Never overwrite
      // an existing image or discover an unwritable destination after generation.
      output = await open(outputPath, "wx", 0o600);
    } catch {
      throw new SmokeError("Could not create --output. Use a new filename in an existing writable directory.");
    }

    const result = await createImageEditResult(sourceBytes, values.prompt, size, referenceBytes, "image/webp", client);
    const metadata = await sharp(result.bytes, { limitInputPixels: 16_777_216 }).metadata();
    if (metadata.format !== "webp" || metadata.width !== size || metadata.height !== size || !result.bytes.length) {
      throw new SmokeError("The model result failed output validation.");
    }
    await output.writeFile(result.bytes);
    await output.sync();
    completed = true;
    console.log(JSON.stringify({
      model: result.model,
      requestId: result.requestId,
      width: metadata.width,
      height: metadata.height,
      bytes: result.bytes.length,
      format: metadata.format,
    }));
    return 0;
  } catch (error) {
    const { ImageProviderError } = await import("@workspace/integrations-openai-ai-server/image");
    if (error instanceof SmokeError || error instanceof ImageProviderError) {
      console.error(error.message);
    } else {
      console.error("Image-edit smoke failed. Check server-side provider configuration and local input/output access. No automatic retry was made.");
    }
    return 1;
  } finally {
    await output?.close();
    if (output && outputPath && !completed) await unlink(outputPath).catch(() => undefined);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runImageEditSmoke();
}

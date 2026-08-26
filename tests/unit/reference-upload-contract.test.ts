import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAXIMUM_ENRICHED_PROMPT_LENGTH,
  PromptLengthError,
  REFERENCE_UPLOAD_INSTRUCTION,
  buildGenerationPrompt,
  STYLE_MODE_EXACT_INSTRUCTION,
  STYLE_MODE_EXPAND_INSTRUCTION,
} from "../../supabase/functions/_shared/prompt.ts";
import {
  MAXIMUM_REFERENCE_PIXELS,
  MINIMUM_REFERENCE_SIDE,
  RasterValidationError,
  validateBoundedWebp,
  validateReferenceSource,
} from "../../supabase/functions/_shared/raster.ts";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const migration = () => read("supabase/migrations/202608250012_reference_uploads.sql");

function ascii(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function uint32le(value: number) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function chunk(type: string, payload: Uint8Array) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set(ascii(type), 0);
  bytes.set(uint32le(payload.length), 4);
  bytes.set(payload, 8);
  return bytes;
}

function webp(width: number, height: number) {
  const frame = Uint8Array.of(
    0, 0, 0,
    0x9d, 0x01, 0x2a,
    width & 0xff, (width >>> 8) & 0xff,
    height & 0xff, (height >>> 8) & 0xff,
  );
  const chunks = [chunk("VP8 ", frame)];
  const bodyLength = 4 + chunks.reduce((total, value) => total + value.length, 0);
  const bytes = new Uint8Array(8 + bodyLength);
  bytes.set(ascii("RIFF"), 0);
  bytes.set(uint32le(bodyLength), 4);
  bytes.set(ascii("WEBP"), 8);
  let offset = 12;
  for (const value of chunks) {
    bytes.set(value, offset);
    offset += value.length;
  }
  return bytes;
}

function png(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set(ascii("IHDR"), 12);
  bytes.set([(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff], 16);
  bytes.set([(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff], 20);
  return bytes;
}

test("uploaded reference bytes are gated on their own magic, size, and pixel count", () => {
  const acceptable = png(1600, 1200);
  assert.deepEqual(validateReferenceSource(acceptable), {
    format: "png",
    width: 1600,
    height: 1200,
    bytes: acceptable.length,
  });

  assert.throws(() => validateReferenceSource(new Uint8Array()), /empty/);
  // Not a raster at all: the parser is chosen by magic bytes, never by a
  // caller-declared media type.
  assert.throws(() => validateReferenceSource(ascii("GIF89a not an image")), RasterValidationError);
  assert.throws(
    () => validateReferenceSource(png(MINIMUM_REFERENCE_SIDE - 1, 4000)),
    /at least 256px/,
  );
  assert.throws(() => validateReferenceSource(png(6000, 6000)), /at most/);
  assert.ok(6000 * 6000 > MAXIMUM_REFERENCE_PIXELS);
});

test("the stored reference is a bounded WebP, so original bytes never persist", () => {
  assert.equal(validateBoundedWebp(webp(1024, 576), 1024).width, 1024);
  assert.equal(validateBoundedWebp(webp(768, 1024), 1024).height, 1024);
  // The re-encoder's own output is re-validated: an oversized or non-WebP
  // response is refused rather than written to the private bucket.
  assert.throws(() => validateBoundedWebp(webp(2048, 1024), 1024), /long side/);
  assert.throws(() => validateBoundedWebp(png(512, 512), 1024), /not a WebP/);
});

test("the upload function re-encodes and never stores or returns the client's bytes", async () => {
  const upload = await read("supabase/functions/upload-reference/index.ts");
  const transcode = await read("supabase/functions/upload-reference/transcode.ts");
  // The bytes that reach storage are the re-encoder's output, not the request's.
  assert.match(upload, /const encoded = await transcodeReference\(original, mediaType\)/);
  assert.match(upload, /uploadPrivate\(objectKey, encoded\.bytes, "image\/webp"\)/);
  assert.doesNotMatch(upload, /uploadPrivate\([^)]*original/);
  // The digest and dimensions recorded describe the stored object.
  assert.match(upload, /sha256Hex\(encoded\.bytes\)/);
  assert.match(upload, /p_width: encoded\.info\.width/);
  // Decode gate runs on the received bytes before anything is stored.
  const validated = upload.indexOf("validateReferenceSource(original)");
  const stored = upload.indexOf("uploadPrivate(objectKey");
  assert.ok(validated > 0 && stored > validated, "bytes must be validated before they are stored");
  // A declared type that disagrees with the magic bytes is refused.
  assert.match(upload, /REFERENCE_MEDIA_TYPES\[sourceInfo\.format\] !== mediaType/);
  // The object key is derived server-side from the authenticated account.
  assert.match(upload, /`reference-uploads\/\$\{user\.id\}\/\$\{uploadId\}\.webp`/);
  assert.match(upload, /const uploadId = crypto\.randomUUID\(\)/);
  // The response carries the opaque id only -- never a key, path, or URL.
  assert.match(upload, /privateJson\(\{ referenceUploadId: uploadId \}, 201\)/);
  assert.doesNotMatch(upload, /signPrivate/);
  // A missing re-encoder fails closed instead of falling back to raw bytes.
  assert.match(transcode, /reference_transcode_not_configured/);
  assert.match(transcode, /if \(!endpoint \|\| !token\)/);
});

test("reference uploads are admitted before any bytes are read and released on failure", async () => {
  const upload = await read("supabase/functions/upload-reference/index.ts");
  const sql = await migration();
  const admitted = upload.indexOf('admin.rpc("admit_reference_upload"');
  const read1 = upload.indexOf("await readBoundedBody(request)");
  assert.ok(admitted > 0 && read1 > admitted, "rate admission must precede reading the body");
  // The body is bounded by an actual byte count, not by a trusted header.
  assert.match(upload, /total > MAXIMUM_REFERENCE_UPLOAD_BYTES/);
  assert.match(upload, /413, "reference_too_large"/);
  // Anything that fails after admission removes the object and the row.
  assert.match(upload, /await discardPendingUpload\(admittedUploadId, storedObjectKey\)/);
  assert.match(upload, /removePrivate\(\[objectKey\]\)/);
  assert.match(upload, /\.from\("reference_uploads"\)\.delete\(\)\.eq\("id", uploadId\)/);
  // Admission counts and inserts in one advisory-locked transaction, so a burst
  // of concurrent uploads cannot each read the same stale count.
  assert.match(sql, /'reference-upload-user-rate'/);
  assert.match(sql, /interval '1 hour'\s*\n?[\s\S]{0,40}\) >= 10/);
  assert.match(sql, /interval '24 hours'\s*\n?[\s\S]{0,40}\) >= 40/);
  const lock = sql.indexOf("'reference-upload-user-rate'");
  const insert = sql.indexOf("insert into public.reference_uploads", lock);
  assert.ok(lock > 0 && insert > lock, "the pending row must be inserted under the rate lock");
});

test("reference_uploads is deny-all and its RPCs are definer-safe", async () => {
  const sql = await migration();
  assert.match(sql, /create table public\.reference_uploads/);
  assert.match(sql, /alter table public\.reference_uploads enable row level security;/);
  assert.match(sql, /revoke all on public\.reference_uploads from public, anon, authenticated;/);
  // No policy is created, so an RLS-enabled table denies every non-service role.
  assert.doesNotMatch(sql, /create policy[\s\S]*reference_uploads/);
  for (const signature of [
    "public.admit_reference_upload(uuid, text, uuid, text)",
    "public.finalize_reference_upload(uuid, uuid, text, text, integer, integer, bigint)",
    "public.purge_expired_reference_uploads(timestamptz)",
    "public.request_generation(text, uuid, uuid, uuid, text, text, boolean, uuid)",
  ]) {
    const escaped = signature.replace(/[.()]/g, (character) => `\\${character}`);
    assert.match(sql, new RegExp(`revoke all on function ${escaped}\\s*\\n?\\s*from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function ${escaped} to service_role;`));
  }
  // Every new function is security definer with an empty search_path.
  const definitions = sql.match(/language (?:plpgsql|sql) security definer set search_path = ''/g) ?? [];
  assert.equal(definitions.length, 4, "all four functions must be definer-safe");
  assert.doesNotMatch(sql, /security definer(?! set search_path = '')/);
});

test("a reference upload is single-use, owner-bound, artwork-bound, and expiring", async () => {
  const sql = await migration();
  assert.match(sql, /where id = p_reference_upload_id\s*\n\s*and user_id = p_user_id\s*\n\s*for update;/);
  assert.match(sql, /v_upload\.artwork_id is distinct from v_art\.id/);
  assert.match(sql, /v_upload\.uploaded_at is null/);
  assert.match(sql, /'invalid_reference_upload'/);
  assert.match(sql, /v_upload\.consumed_at is not null[\s\S]{0,120}'reference_upload_consumed'/);
  assert.match(sql, /v_upload\.expires_at <= now\(\)[\s\S]{0,120}'reference_upload_expired'/);
  assert.match(sql, /update public\.reference_uploads\s*\n\s*set consumed_at = now\(\)/);
  assert.match(sql, /expires_at timestamptz not null default now\(\) \+ interval '24 hours'/);
  // Consumption is the last thing that happens, after every other refusal and
  // after the allowance slot is secured, so a doomed request never burns it.
  const slot = sql.indexOf("'generation_allowance_exhausted'");
  const consume = sql.indexOf("set consumed_at = now()");
  assert.ok(slot > 0 && consume > slot, "the upload must be consumed after allowance admission");
});

test("a prior result and an uploaded reference are mutually exclusive", async () => {
  const sql = await migration();
  const worker = await read("supabase/functions/generate-image/index.ts");
  const client = await read("src/lib/artcovr/functions.ts");
  assert.match(
    sql,
    /if p_reference_generation_id is not null and p_reference_upload_id is not null then\s*\n\s*raise exception 'dual_reference_conflict'/,
  );
  assert.match(worker, /body\.referenceGenerationId && body\.referenceUploadId/);
  assert.match(worker, /400, "dual_reference_conflict"/);
  assert.match(client, /referenceUploadId\?: string/);
  assert.match(client, /Mutually exclusive with `referenceGenerationId`/);
});

test("the client uploads raw bytes and never learns a storage key", async () => {
  const client = await read("src/lib/artcovr/functions.ts");
  assert.match(client, /export async function uploadReference\(\s*\n?\s*file: Blob,\s*\n?\s*artworkId: string,?\s*\n?\s*\): Promise<ReferenceUploadResponse>/);
  assert.match(client, /REFERENCE_UPLOAD_MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(client, /"image\/jpeg",\s*\n\s*"image\/png",\s*\n\s*"image\/webp",/);
  assert.match(client, /415,\s*\n?\s*"unsupported_media_type"/);
  assert.match(client, /413,\s*\n?\s*"reference_too_large"/);
  assert.match(client, /\/functions\/v1\/upload-reference\?artworkId=\$\{encodeURIComponent\(artworkId\)\}/);
  assert.match(client, /headers\.set\("Content-Type", contentType\)/);
});

test("a failed generation removes the reference upload it consumed", async () => {
  const worker = await read("supabase/functions/generate-image/index.ts");
  const sql = await migration();
  assert.match(worker, /async function discardReferenceUpload\(objectKey: string \| null\)/);
  assert.match(worker, /await removePrivate\(\[objectKey\]\)/);
  assert.match(worker, /\.from\("reference_uploads"\)\.delete\(\)\.eq\("object_key", objectKey\)/);
  // The worker's failure path releases the allowance and both kinds of object.
  assert.match(worker, /if \(!finalized\) await removePrivate\(uploaded\);/);
  assert.match(worker, /if \(!finalized\) await discardReferenceUpload\(referenceUploadKey\);/);
  // A request that consumed an upload but never reached the worker releases it too.
  assert.match(worker, /await discardReferenceUpload\(allocatedReferenceUploadKey\);/);
  // Deleting the upload row cannot be blocked by the provenance link.
  assert.match(sql, /reference_upload_id uuid references public\.reference_uploads\(id\) on delete set null/);
});

test("the artwork stays the edited image and the upload is only an extra input", async () => {
  const worker = await read("supabase/functions/generate-image/index.ts");
  const openai = await read("supabase/functions/_shared/openai-images.ts");
  assert.match(worker, /const source = await downloadPrivate\(running\.source_object_key\)/);
  assert.match(worker, /referenceUploadKey \? \[await downloadPrivate\(referenceUploadKey\)\] : \[\]/);
  assert.match(worker, /editImage\(source, providerPrompt, Boolean\(running\.purchase_id\), references\)/);
  // The single-image request is unchanged: the primary part is still `set`, and
  // nothing is appended when there is no reference.
  assert.match(openai, /form\.set\("image\[\]", new File\(\[source\], "source\.png"/);
  assert.match(openai, /references\.forEach\(\(reference, index\) => \{/);
  assert.match(openai, /form\.append\(\s*\n?\s*"image\[\]"/);
  assert.match(openai, /references: Blob\[\] = \[\]/);
  // A provider without a repeated image part refuses rather than silently
  // dropping the reference the user supplied.
  assert.match(openai, /export const supportsReferenceUploads = provider === "openai"/);
  assert.match(openai, /references\.length > 0 && !supportsReferenceUploads/);
  assert.match(openai, /maximumReferenceImages = 1/);
  assert.match(worker, /body\.referenceUploadId && !supportsReferenceUploads/);
});

test("prompt enrichment is deterministic, verbatim, and bounded rather than truncated", () => {
  const artwork = {
    title: "  Nocturne   Drift ",
    category: "ambient",
    moodTags: ["hazy", "hazy", " nocturnal ", ""],
  };
  const first = buildGenerationPrompt({ artwork, userPrompt: "make the sky red", hasReferenceUpload: false });
  const second = buildGenerationPrompt({ artwork, userPrompt: "make the sky red", hasReferenceUpload: false });

  // Same inputs, same bytes -- no model call and no randomness anywhere.
  assert.equal(first, second);
  // Owner facts are normalized and de-duplicated, order preserved.
  assert.match(first, /titled "Nocturne Drift"/);
  assert.match(first, /from the ambient category/);
  assert.match(first, /established with the mood hazy, nocturnal/);
  // The user's text is carried through verbatim and last.
  assert.ok(first.endsWith("Requested change: make the sky red"));
  assert.equal(first.split("make the sky red").length - 1, 1);
  // The upload instruction appears only when an upload is attached.
  assert.ok(!first.includes(REFERENCE_UPLOAD_INSTRUCTION));
  const withUpload = buildGenerationPrompt({ artwork, userPrompt: "make the sky red", hasReferenceUpload: true });
  assert.ok(withUpload.includes(REFERENCE_UPLOAD_INSTRUCTION));
  assert.ok(withUpload.endsWith("Requested change: make the sky red"));

  // A missing anchor degrades to the instruction plus the request, never to a
  // fabricated title or category.
  const bare = buildGenerationPrompt({
    artwork: { title: null, category: null, moodTags: null },
    userPrompt: "soften the edges",
    hasReferenceUpload: false,
  });
  assert.ok(!bare.includes("The artwork being edited is"));
  assert.ok(bare.endsWith("Requested change: soften the edges"));

  // Over-long combinations raise instead of silently losing the tail.
  assert.throws(
    () => buildGenerationPrompt({
      artwork,
      userPrompt: "x".repeat(MAXIMUM_ENRICHED_PROMPT_LENGTH),
      hasReferenceUpload: false,
    }),
    PromptLengthError,
  );
});

test("enrichment runs server-side before any allowance is spent", async () => {
  const worker = await read("supabase/functions/generate-image/index.ts");
  const built = worker.indexOf("buildGenerationPrompt({");
  const requested = worker.indexOf('admin.rpc("request_generation"');
  assert.ok(built > 0 && requested > built, "the prompt must be built before admission");
  assert.match(worker, /400, "prompt_too_long"/);
  assert.match(worker, /error instanceof PromptLengthError/);
  // The database still records what the user typed; only the provider sees the
  // enriched text, so enrichment can never be replayed as the user's own words.
  assert.match(worker, /p_prompt: body\.prompt/);
  assert.match(worker, /userPrompt: body\.prompt/);
  assert.match(worker, /\.select\("title,category,mood_tags"\)/);
});

test("request_generation keeps every pre-existing admission and lineage rule", async () => {
  const sql = await migration();
  const previous = await read("supabase/migrations/202608140010_generation_rate_lanes.sql");
  // The rewrite is a drop-and-create because the return type changed; the new
  // signature must be the only one left.
  assert.match(sql, /drop function if exists public\.request_generation\(text, uuid, uuid, uuid, text, text, boolean\);/);
  assert.match(sql, /p_reference_upload_id uuid default null/);
  assert.match(sql, /reference_upload_object_key text/);
  // Every guard the live definition enforced is still present verbatim.
  for (const guard of [
    "'generation-global-rate'",
    "'generation-purchased-rate'",
    "'generation-user-rate'",
    "'invalid_prompt'",
    "'reset_reference_conflict'",
    "'artwork_not_generation_ready'",
    "'purchase_not_entitled'",
    "'generation_in_progress'",
    "'preview_current_reference_required'",
    "'selected_preview_unavailable'",
    "'invalid_generation_reference'",
    "'generation_reference_expired'",
    "'preview_cannot_reference_purchased_result'",
    "'reference_is_not_selected_preview'",
    "'reference_belongs_to_another_purchase'",
    "'reference_is_not_current'",
    "'generation_allowance_exhausted'",
  ]) {
    assert.ok(previous.includes(guard), `${guard} should exist in the previous definition`);
    assert.ok(sql.includes(guard), `${guard} must survive the rewrite`);
  }
  assert.match(sql, /interval '10 minutes'[\s\S]{0,80}>= 6/);
  assert.match(sql, /interval '24 hours'[\s\S]{0,80}>= 24/);
  assert.match(sql, /v_limit := 2;/);
  assert.match(sql, /v_limit := 4;/);
  // Applied migrations stay untouched.
  assert.match(previous, /returns table\(generation_id uuid, allowance_slot smallint, source_object_key text\)/);
});

test("cover text is rendered verbatim into the enrichment and never invents extra text", () => {
  const artwork = { title: "Nocturne Drift", category: "ambient", moodTags: ["hazy"] };
  const withCover = buildGenerationPrompt({
    artwork,
    userPrompt: "make the sky red",
    hasReferenceUpload: false,
    coverText: { title: "  Midnight   Static ", artistName: " The  Long Now " },
  });
  // Whitespace-normalised, quoted verbatim, and fenced against hallucinated text.
  assert.ok(withCover.includes('the title "Midnight Static"'));
  assert.ok(withCover.includes('the artist name "The Long Now"'));
  assert.ok(withCover.includes("no other text"));

  const without = buildGenerationPrompt({ artwork, userPrompt: "make the sky red", hasReferenceUpload: false });
  assert.ok(!without.includes("cover typography"));

  const again = buildGenerationPrompt({
    artwork,
    userPrompt: "make the sky red",
    hasReferenceUpload: false,
    coverText: { title: "  Midnight   Static ", artistName: " The  Long Now " },
  });
  assert.equal(withCover, again);
});

test("style mode branches deterministically and defaults to exact", () => {
  const artwork = { title: "Nocturne Drift", category: "ambient", moodTags: [] };
  const base = { artwork, userPrompt: "add rain", hasReferenceUpload: false } as const;

  const defaulted = buildGenerationPrompt({ ...base });
  const exact = buildGenerationPrompt({ ...base, styleMode: "exact" });
  const expand = buildGenerationPrompt({ ...base, styleMode: "expand" });

  assert.equal(defaulted, exact);
  assert.ok(exact.includes(STYLE_MODE_EXACT_INSTRUCTION));
  assert.ok(expand.includes(STYLE_MODE_EXPAND_INSTRUCTION));
  assert.ok(!expand.includes(STYLE_MODE_EXACT_INSTRUCTION));
  assert.notEqual(exact, expand);
});

test("the edge function bounds cover text and the provider is pinned to high input fidelity", async () => {
  const generate = await readFile(
    new URL("../../supabase/functions/generate-image/index.ts", import.meta.url),
    "utf8",
  );
  // Cover text is validated before any allowance is spent, with its own code.
  assert.match(generate, /cover_text_too_long/);
  assert.match(generate, /coverText/);
  assert.match(generate, /styleMode/);

  const provider = await readFile(
    new URL("../../supabase/functions/_shared/openai-images.ts", import.meta.url),
    "utf8",
  );
  // Reference adherence: without high input fidelity the edit loosely
  // reinterprets the source and both style modes become meaningless.
  assert.match(provider, /form\.set\("input_fidelity", "high"\)/);
});

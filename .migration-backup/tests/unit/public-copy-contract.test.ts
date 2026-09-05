import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("support and license copy matches the confirmed ARTCOVR product", async () => {
  const [faq, license, refunds, about] = await Promise.all([
    read("src/app/faq/page.tsx"),
    read("src/app/license/page.tsx"),
    read("src/app/refunds/page.tsx"),
    read("src/app/about/page.tsx"),
  ]);
  const copy = `${faq}\n${license}\n${refunds}\n${about}`;
  assert.match(copy, /commercial license/i);
  assert.match(copy, /standalone resale/i);
  assert.match(copy, /AI-training use/i);
  assert.match(copy, /full refund/i);
  assert.match(copy, /cannot be recalled/i);
  assert.doesNotMatch(copy, /one documented release use/i);
  assert.doesNotMatch(copy, /directions are reviewed/i);
  assert.doesNotMatch(copy, /number of licenses available/i);
});

test("public purchase details match the authoritative commerce and generation contracts", async () => {
  const [faq, terms, product, reservationSql, generationSql, imageProvider] =
    await Promise.all([
      read("src/app/faq/page.tsx"),
      read("src/app/legal/terms/page.tsx"),
      read("src/app/product/[slug]/page.tsx"),
      read("supabase/migrations/202608140009_convergence_hardening.sql"),
      read("supabase/migrations/202608250012_reference_uploads.sql"),
      read("supabase/functions/_shared/openai-images.ts"),
    ]);
  const publicCopy = `${faq}\n${terms}\n${product}`.replace(/\s+/g, " ");

  assert.match(reservationSql, /interval '45 minutes'/);
  assert.match(terms, /reserved for up to 45 minutes/i);
  assert.doesNotMatch(terms, /reserved for up to 15 minutes/i);

  assert.match(generationSql, /v_limit := 2/);
  assert.match(generationSql, /v_limit := 4/);
  assert.match(imageProvider, /purchased \? "2048x2048" : "1024x1024"/);
  assert.match(generationSql, /interval '7 days' else interval '30 days'/);
  assert.match(publicCopy, /two successful 1024 × 1024 px watermarked previews/i);
  assert.match(publicCopy, /four successful 2048 × 2048 px purchased generations/i);
  assert.match(publicCopy, /30 days (?:of|from).*signed-download access/i);
  assert.match(publicCopy, /digital-only/i);
  assert.match(publicCopy, /without upscaling/i);
});

test("refund and provider copy does not imply an unconfirmed policy or deployment", async () => {
  const [faq, privacy] = await Promise.all([
    read("src/app/faq/page.tsx"),
    read("src/app/legal/privacy/page.tsx"),
  ]);

  assert.match(faq, /How are refund requests handled\?/);
  assert.doesNotMatch(faq, /What is your refund window\?/);
  assert.match(privacy, /configured AI image provider—OpenAI or xAI—receives/);
  assert.doesNotMatch(privacy, /numbers\. OpenAI receives/);
  assert.match(privacy, /supported optional reference image/);
});

test("health diagnostics: static export uses no server route handlers", async () => {
  // The /api/health Route Handler was removed for Cloudflare Pages static export.
  // Health checks are served by Cloudflare infrastructure. Verify the old dynamic
  // route files no longer exist in the source tree.
  const { access } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../../src/app/api", import.meta.url));
  await assert.rejects(
    () => access(`${root}/health/route.ts`),
    /ENOENT/,
    "api/health/route.ts should not exist in a static export build",
  );
  await assert.rejects(
    () => access(`${root}/route.ts`),
    /ENOENT/,
    "api/route.ts should not exist in a static export build",
  );
});

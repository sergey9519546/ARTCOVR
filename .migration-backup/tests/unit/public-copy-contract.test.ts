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

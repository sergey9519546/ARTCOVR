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

test("health diagnostics remain host-relative, dynamic, and uncached", async () => {
  const [redirect, health] = await Promise.all([
    read("src/app/api/route.ts"),
    read("src/app/api/health/route.ts"),
  ]);
  assert.match(redirect, /new URL\("\/api\/health", request\.url\)/);
  assert.doesNotMatch(redirect, /artcovr\.com/);
  assert.match(health, /force-dynamic/);
  assert.match(health, /Cache-Control.*no-store/);
  assert.doesNotMatch(health, /process\.uptime/);
});

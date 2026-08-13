import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { LAUNCH_REVIEW_SIZE } from "../../src/lib/artcovr/catalog-review.ts";
import { candidateIdentityFingerprint } from "../../scripts/catalog/approval-workbook-schema.mjs";

const readJson = async (path: string) =>
  JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), "utf8"));

test("approval workbook builder and importer share the growing authoritative identity source", async () => {
  const source = await readFile(
    new URL("../../scripts/catalog/import-approval-workbook.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /catalog", "curated-artworks\.json"/);

  const curated = await readJson("catalog/curated-artworks.json");
  const ids = curated.map((record: { id: string }) => record.id);
  assert.equal(curated.length, LAUNCH_REVIEW_SIZE);
  assert.equal(new Set(ids).size, curated.length);
  assert.ok(ids.every((id: string) => /^art_[0-9a-f]{20}$/.test(id)));
});

test("the approval import report cannot describe a stale candidate generation", async () => {
  const [curated, report] = await Promise.all([
    readJson("catalog/curated-artworks.json"),
    readJson("catalog/approval-import-report.json"),
  ]);

  assert.equal(report.candidates, curated.length);
  assert.equal(report.candidateIdentitySha256, candidateIdentityFingerprint(curated));
  assert.equal(report.approved + report.rejectedOrPending, report.candidates);
  assert.equal(report.launchCountValid, report.approved >= 100 && report.approved <= 200);
});

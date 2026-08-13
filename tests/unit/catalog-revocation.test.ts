import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogRevocations } from "../../src/lib/artcovr/catalog-revocation.ts";

test("catalog delisting requires an explicit SHA-bound owner revocation", () => {
  const sha = "a".repeat(64);
  const build = buildCatalogRevocations([{
    catalogId: `art_${sha.slice(0, 20)}`,
    sourceSha256: sha,
    reason: "Owner withdrew publication rights",
    revokedAt: "2026-08-13T12:00:00.000Z",
  }]);

  assert.deepEqual(build.issues, []);
  assert.equal(build.rows.length, 1);
  assert.match(build.sql, /set is_listed = false/);
  assert.match(build.sql, /source_sha256 = revoked\.source_sha256/);
  assert.doesNotMatch(build.sql, /delete from public\.artworks/i);
});

test("empty, duplicate, or identity-mismatched revocations emit no SQL", () => {
  assert.equal(buildCatalogRevocations([]).sql, "");
  const invalid = buildCatalogRevocations([{
    catalogId: `art_${"a".repeat(20)}`,
    sourceSha256: "b".repeat(64),
    reason: "Withdrawn",
    revokedAt: "2026-08-13T12:00:00.000Z",
  }]);
  assert.ok(invalid.issues.length > 0);
  assert.equal(invalid.sql, "");
});

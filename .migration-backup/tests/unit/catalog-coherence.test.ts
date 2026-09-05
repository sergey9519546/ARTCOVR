import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";

import approvedCatalog from "../../catalog/approved-artworks.json" with { type: "json" };
import curatedCandidates from "../../catalog/curated-artworks.json" with { type: "json" };
import curatedPublic from "../../src/lib/artcovr/curated-public.json" with { type: "json" };
import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };

/**
 * ADR-023 — the catalog artifacts and the one relation that binds them.
 *
 *   catalog/curated-artworks.json       100 rows  frozen launch-review candidate set
 *   catalog/approved-artworks.json      217 rows  owner-approved audit artifact (superset)
 *   src/lib/artcovr/curated-public.json 187 rows  generated projection of the approved rows
 *   src/lib/artcovr/curated-review.json 169 rows  private staging snapshot
 *
 * INVARIANT
 *   curated ⊂ approved                      (approved positions 1..100, identity-preserving)
 *   review  ⊂ approved                      (approved positions 1..169)
 *   public  = { r ∈ approved | r.tier ≠ "delete" }
 *   D       = curated \ public              = the 30 tier "delete" rows, all of which are
 *                                             original launch works
 *   assets  ↔ public                        bijection over public/assets/artworks
 *
 * Nothing here is hand-maintained: curated-public.json is written only by
 * `bun run catalog:project` (scripts/catalog/project-approved-catalog.ts →
 * projectApprovedCatalog), so a violation means the projection is stale or an
 * artifact was edited outside its pipeline.
 */

type ApprovedRow = {
  id: string;
  position: number;
  slug: string;
  sha256: string;
  displayPath: string;
  tier: string;
};
type CandidateRow = { id: string; position: number; slug: string; sha256: string };
type PublicRow = { id: string; slug: string; image: string; tier: string };
type ReviewRow = { slug: string };

const approved = approvedCatalog as unknown as ApprovedRow[];
const curated = curatedCandidates as unknown as CandidateRow[];
const publicRows = curatedPublic as unknown as PublicRow[];
const reviewRows = curatedReview as unknown as ReviewRow[];

const approvedBySlug = new Map(approved.map((row) => [row.slug, row]));
const approvedSlugs = new Set(approved.map((row) => row.slug));
const publicSlugs = new Set(publicRows.map((row) => row.slug));
const curatedSlugs = new Set(curated.map((row) => row.slug));
const deleteRows = approved.filter((row) => row.tier === "delete");

const sorted = (values: Iterable<string>): string[] => [...values].sort();
const range = (length: number): number[] => Array.from({ length }, (_, index) => index + 1);

test("the catalog artifacts hold their recorded row counts (ADR-023)", () => {
  // Provisional numeric pins. The counts are not invariants in themselves — the
  // catalog is expected to grow — but they are the state ADR-023 records, so a
  // change must land with a decision record rather than a silent re-run.
  assert.equal(curated.length, 100, "curated-artworks.json is the frozen 100-work launch review set");
  assert.equal(approved.length, 217, "approved-artworks.json is the 217-row owner audit artifact");
  assert.equal(publicRows.length, 187, "curated-public.json is the 187-row publishable projection");
  assert.equal(reviewRows.length, 169, "curated-review.json is the 169-row private staging snapshot");

  assert.equal(new Set(approved.map((row) => row.id)).size, approved.length, "approved ids are unique");
  assert.equal(
    new Set(approved.map((row) => row.sha256)).size,
    approved.length,
    "approved source digests are unique",
  );
  assert.equal(
    new Set(approved.map((row) => row.position)).size,
    approved.length,
    "approved positions are unique",
  );
});

test("the frozen launch candidate set is a subset of the approved artifact, identity-preserved", () => {
  const missing = sorted(curated.map((row) => row.slug)).filter((slug) => !approvedSlugs.has(slug));
  assert.deepEqual(missing, [], "every curated-artworks.json candidate must survive in approved-artworks.json");

  for (const candidate of curated) {
    const row = approvedBySlug.get(candidate.slug) as ApprovedRow;
    assert.equal(row.id, candidate.id, `${candidate.slug}: catalog id must not change on approval`);
    assert.equal(row.sha256, candidate.sha256, `${candidate.slug}: source digest must not change on approval`);
    assert.equal(row.position, candidate.position, `${candidate.slug}: launch position must not change on approval`);
  }

  // The launch 100 occupy approved positions 1..100 contiguously; everything
  // above position 100 is post-launch expansion.
  assert.deepEqual(curated.map((row) => row.position).sort((left, right) => left - right), range(100));
  const expansion = approved.filter((row) => !curatedSlugs.has(row.slug));
  assert.equal(expansion.length, 117, "117 works were appended after the launch review set");
  assert.ok(
    expansion.every((row) => row.position > 100),
    "expansion rows must never take a launch position slot",
  );
});

test("the private staging snapshot is a subset of the approved artifact", () => {
  const orphans = sorted(reviewRows.map((row) => row.slug)).filter((slug) => !approvedSlugs.has(slug));
  assert.deepEqual(orphans, [], "curated-review.json must never carry a slug the owner has not approved");

  const reviewSlugs = new Set(reviewRows.map((row) => row.slug));
  const positions = approved
    .filter((row) => reviewSlugs.has(row.slug))
    .map((row) => row.position)
    .sort((left, right) => left - right);
  assert.deepEqual(positions, range(169));
});

test("the public projection is exactly the non-delete approved rows", () => {
  assert.deepEqual(
    sorted(publicSlugs),
    sorted(approved.filter((row) => row.tier !== "delete").map((row) => row.slug)),
    "public = approved minus delete-tier; a difference means catalog:project is stale",
  );

  const publicById = new Map(publicRows.map((row) => [row.id, row]));
  for (const row of approved) {
    if (row.tier === "delete") {
      assert.equal(
        publicById.has(row.id),
        false,
        `${row.slug}: audit-preserved deletion leaked into the projection`,
      );
      continue;
    }
    const projected = publicById.get(row.id);
    assert.ok(projected, `${row.slug}: approved row missing from the projection`);
    assert.equal(projected.slug, row.slug, `${row.id}: projected slug must match the approved row`);
    assert.equal(
      projected.tier,
      row.tier,
      `${row.slug}: the projection must carry the owner's display tier verbatim`,
    );
  }
});

test("the 30 delisted works are all original launch works, and the expansion lost none (ADR-023)", () => {
  const delisted = sorted(curatedSlugs).filter((slug) => !publicSlugs.has(slug));
  assert.equal(delisted.length, 30, "30 of the launch 100 are no longer published");
  assert.deepEqual(
    delisted,
    sorted(deleteRows.map((row) => row.slug)),
    "the works missing from public must be exactly the delete-tier rows; none may be silently lost",
  );
  assert.ok(
    deleteRows.every((row) => curatedSlugs.has(row.slug)),
    "no post-launch expansion work carries the delete tier",
  );

  // 100 - 30 delisted = 70 survivors; 187 - 70 = 117 works new since launch.
  assert.equal(sorted(curatedSlugs).filter((slug) => publicSlugs.has(slug)).length, 70);
  assert.equal(sorted(publicSlugs).filter((slug) => !curatedSlugs.has(slug)).length, 117);
});

test("public/assets/artworks is a bijection with the public projection — no orphan bytes", async () => {
  const files = (
    await readdir(new URL("../../public/assets/artworks/", import.meta.url), { withFileTypes: true })
  )
    .filter((entry) => entry.isFile())
    .map((entry) => `/assets/artworks/${entry.name}`);

  // Keyed on the `image` field the storefront actually requests, not on the
  // slug-to-filename convention, so a projection that renames an image without
  // shipping the bytes fails here.
  assert.deepEqual(sorted(files), sorted(publicRows.map((row) => row.image)));

  for (const row of publicRows) {
    const approvedRow = approvedBySlug.get(row.slug) as ApprovedRow;
    assert.equal(
      row.image,
      approvedRow.displayPath,
      `${row.slug}: projected image path must match the approved displayPath`,
    );
  }

  const shipped = new Set(files);
  for (const row of deleteRows) {
    assert.equal(
      shipped.has(row.displayPath),
      false,
      `${row.slug}: a delisted work's display derivative must not remain on disk`,
    );
  }
});

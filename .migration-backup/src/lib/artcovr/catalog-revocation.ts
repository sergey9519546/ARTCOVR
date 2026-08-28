import { canonicalJson, sha256 } from "./catalog-import.ts";

export type CatalogRevocation = {
  catalogId: string;
  sourceSha256: string;
  reason: string;
  revokedAt: string;
};

export type CatalogRevocationBuild = {
  rows: CatalogRevocation[];
  issues: string[];
  sourceSha256: string;
  sql: string;
};

const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function buildCatalogRevocations(value: unknown): CatalogRevocationBuild {
  const issues: string[] = [];
  const rows: CatalogRevocation[] = [];
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    return { rows, issues: ["REVOCATIONS_NOT_ARRAY"], sourceSha256: sha256(canonicalJson(value)), sql: "" };
  }

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object") {
      issues.push(`INVALID_REVOCATION:${index}`);
      continue;
    }
    const row = entry as Record<string, unknown>;
    const catalogId = typeof row.catalogId === "string" ? row.catalogId.trim() : "";
    const sourceSha256 = typeof row.sourceSha256 === "string" ? row.sourceSha256.trim() : "";
    const reason = typeof row.reason === "string" ? row.reason.trim() : "";
    const revokedAt = typeof row.revokedAt === "string" ? row.revokedAt.trim() : "";
    if (
      !/^art_[0-9a-f]{20}$/.test(catalogId) ||
      !/^[0-9a-f]{64}$/.test(sourceSha256) ||
      catalogId !== `art_${sourceSha256.slice(0, 20)}` ||
      reason.length < 3 ||
      !Number.isFinite(Date.parse(revokedAt)) ||
      ids.has(catalogId)
    ) {
      issues.push(`INVALID_REVOCATION:${index}`);
      continue;
    }
    ids.add(catalogId);
    rows.push({ catalogId, sourceSha256, reason, revokedAt });
  }
  rows.sort((left, right) => left.catalogId.localeCompare(right.catalogId, "en"));
  const sourceSha256 = sha256(canonicalJson(rows));
  if (issues.length > 0 || rows.length === 0) return { rows, issues, sourceSha256, sql: "" };

  const values = rows
    .map((row) => `  (${sqlString(row.catalogId)}, ${sqlString(row.sourceSha256)}, ${sqlString(row.reason)}, ${sqlString(row.revokedAt)}::timestamptz)`)
    .join(",\n");
  const sql = `-- GENERATED FILE. Explicit owner-approved catalog revocations only.
-- Source SHA-256: ${sourceSha256}
begin;
with revoked(catalog_id, source_sha256, reason, revoked_at) as (
  values
${values}
)
update public.artworks as artwork
set is_listed = false
from revoked
where artwork.catalog_id = revoked.catalog_id
  and artwork.source_sha256 = revoked.source_sha256;

do $artcovr_revocation_verify$
begin
  if exists (
    with revoked(catalog_id, source_sha256) as (
      values
${rows.map((row) => `      (${sqlString(row.catalogId)}, ${sqlString(row.sourceSha256)})`).join(",\n")}
    )
    select 1 from revoked
    left join public.artworks artwork
      on artwork.catalog_id = revoked.catalog_id
     and artwork.source_sha256 = revoked.source_sha256
    where artwork.catalog_id is null or artwork.is_listed
  ) then
    raise exception 'artcovr_catalog_revocation_incomplete';
  end if;
end
$artcovr_revocation_verify$;
commit;
`;
  return { rows, issues, sourceSha256, sql };
}

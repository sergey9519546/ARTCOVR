import { createHash } from "node:crypto";

export const APPROVED_CATALOG_SOURCE = "catalog/approved-artworks.json";
export const CATALOG_SQL_OUTPUT = "supabase/seed/artworks.approved.sql";
export const CATALOG_MANIFEST_OUTPUT = "supabase/seed/artworks.approved.manifest.json";

type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CatalogImportIssue = {
  index: number;
  catalogId: string | null;
  code:
    | "ARTIFACT_NOT_ARRAY"
    | "ROW_NOT_OBJECT"
    | "NOT_APPROVED"
    | "TECHNICAL_GATE_FAILED"
    | "INVALID_IDENTITY"
    | "DUPLICATE_IDENTITY"
    | "INVALID_FIELD"
    | "INVALID_METADATA";
  message: string;
};

export type SupabaseArtworkImportRow = {
  catalogId: string;
  slug: string;
  title: string;
  description: string;
  promptBase: string;
  saleMode: "exclusive" | "repeatable";
  priceCents: number;
  currency: "USD";
  licenseVersion: "v1";
  baseObjectKey: string;
  catalogObjectKey: string;
  styleId: string | null;
  category: string;
  sourceOrdinal: number | null;
  altText: string;
  moodTags: string[];
  keywords: string[];
  avoids: string[];
  palette: string[];
  lighting: string;
  mediumAndTexture: string;
  lineworkAndEdges: string;
  compositionAndMotion: string;
  sourceSha256: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  sourceMimeType: "image/jpeg" | "image/png";
  styleMetadata: { [key: string]: JsonValue };
  searchDocument: string;
};

export type CatalogImportManifest = {
  schemaVersion: 1;
  source: typeof APPROVED_CATALOG_SOURCE;
  sourceSha256: string;
  rowCount: number;
  searchVector: {
    column: "public.artworks.search_vector";
    strategy: "database-generated-postgres-tsvector";
  };
  rows: Array<{
    catalogId: string;
    sourceSha256: string;
    title: string;
    description: string;
    keywords: string[];
    styleId: string | null;
    styleMetadataSha256: string;
    baseObjectKey: string;
    catalogObjectKey: string;
  }>;
};

export type CatalogImportBuild = {
  sourceSha256: string;
  rows: SupabaseArtworkImportRow[];
  issues: CatalogImportIssue[];
  sql: string;
  manifest: CatalogImportManifest;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRemovedAuditRow = (value: unknown): boolean =>
  isObject(value) && value.tier === "delete";

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return null;
  return [...value] as string[];
};

const isSafePositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function canonicalize(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  throw new TypeError("Catalog metadata must contain only JSON values.");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function issue(
  index: number,
  catalogId: string | null,
  code: CatalogImportIssue["code"],
  message: string,
): CatalogImportIssue {
  return { index, catalogId, code, message };
}

function hasSafeRelativePath(value: string): boolean {
  return (
    value.length > 0 &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function catalogStorageKey(displayPath: string): string | null {
  if (!displayPath.startsWith("/") || displayPath.includes("\\")) return null;
  const key = displayPath.replace(/^\/+/, "");
  return hasSafeRelativePath(key) ? key : null;
}

function approvedMoodTags(mood: string): string[] {
  return mood
    .split(/[,;]/)
    .map((value) => value.trim())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

function buildSearchDocument(row: {
  title: string;
  description: string;
  category: string;
  moodTags: string[];
  keywords: string[];
  palette: string[];
  lighting: string;
  mediumAndTexture: string;
}): string {
  return [
    row.title,
    row.description,
    row.category,
    ...row.moodTags,
    ...row.keywords,
    ...row.palette,
    row.lighting,
    row.mediumAndTexture,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" | ");
}

function validateRow(
  value: unknown,
  index: number,
): { row: SupabaseArtworkImportRow | null; issues: CatalogImportIssue[] } {
  if (!isObject(value)) {
    return {
      row: null,
      issues: [issue(index, null, "ROW_NOT_OBJECT", "Every approved catalog entry must be an object.")],
    };
  }

  const catalogId = asNonEmptyString(value.id);
  const rowIssues: CatalogImportIssue[] = [];
  if (value.rightsApproved !== true || value.published !== true) {
    rowIssues.push(
      issue(
        index,
        catalogId,
        "NOT_APPROVED",
        "Only rows with rightsApproved=true and published=true may be emitted.",
      ),
    );
  }
  if (value.validationStatus !== "technical-pass") {
    rowIssues.push(
      issue(index, catalogId, "TECHNICAL_GATE_FAILED", "The source must retain technical-pass status."),
    );
  }

  const sourceSha256 = asNonEmptyString(value.sha256);
  const expectedCatalogId = sourceSha256?.match(/^[0-9a-f]{64}$/)
    ? `art_${sourceSha256.slice(0, 20)}`
    : null;
  if (!catalogId || !expectedCatalogId || catalogId !== expectedCatalogId) {
    rowIssues.push(
      issue(
        index,
        catalogId,
        "INVALID_IDENTITY",
        "catalog id must equal art_ plus the first 20 lowercase hexadecimal characters of source SHA-256.",
      ),
    );
  }

  const slug = asNonEmptyString(value.slug);
  const title = asNonEmptyString(value.title);
  const description = asNonEmptyString(value.description);
  const category = asNonEmptyString(value.category);
  const mood = asNonEmptyString(value.mood);
  const altText = asNonEmptyString(value.alt);
  const promptBase = value.sourcePrompt === null ? "" : asString(value.sourcePrompt);
  const baseObjectKey = asNonEmptyString(value.privateBasePath);
  const displayPath = asNonEmptyString(value.displayPath);
  const derivedCatalogObjectKey = displayPath ? catalogStorageKey(displayPath) : null;
  const saleMode = value.saleMode;
  const priceCents = value.priceCents;
  const currency = value.currency;
  const sourceWidth = value.width;
  const sourceHeight = value.height;
  const sourceBytes = value.bytes;
  const sourceMimeType = value.sourceMimeType;
  const sourceOrdinal = value.sourceOrdinal;

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "slug must be a lowercase kebab-case value."));
  }
  if (!title || title.length > 160) {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "title must contain 1 to 160 characters."));
  }
  if (!description || !category || !mood || !altText) {
    rowIssues.push(
      issue(index, catalogId, "INVALID_FIELD", "description, category, mood, and alt text are required."),
    );
  }
  if (promptBase === null || promptBase.length > 12_000) {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "sourcePrompt must be null or a string up to 12000 characters."));
  }
  if (!baseObjectKey || !hasSafeRelativePath(baseObjectKey) || !derivedCatalogObjectKey) {
    rowIssues.push(
      issue(index, catalogId, "INVALID_FIELD", "base and catalog asset paths must be safe relative object keys."),
    );
  }
  if (saleMode !== "exclusive" && saleMode !== "repeatable") {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "saleMode must be exclusive or repeatable."));
  }
  if (!isSafePositiveInteger(priceCents) || currency !== "USD") {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "priceCents must be positive and currency must be USD."));
  }
  if (
    !isSafePositiveInteger(sourceWidth) ||
    !isSafePositiveInteger(sourceHeight) ||
    sourceWidth < 1024 ||
    sourceWidth !== sourceHeight ||
    !isSafePositiveInteger(sourceBytes)
  ) {
    rowIssues.push(
      issue(index, catalogId, "TECHNICAL_GATE_FAILED", "source dimensions/bytes must describe a decodable square source of at least 1024px."),
    );
  }
  if (sourceMimeType !== "image/jpeg" && sourceMimeType !== "image/png") {
    rowIssues.push(issue(index, catalogId, "TECHNICAL_GATE_FAILED", "sourceMimeType must be image/jpeg or image/png."));
  }
  if (sourceOrdinal !== null && (!isSafePositiveInteger(sourceOrdinal) || sourceOrdinal > 2_147_483_647)) {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "sourceOrdinal must be null or a positive 32-bit integer."));
  }

  const metadata = value.metadata;
  const keywords = isObject(metadata) ? asStringArray(metadata.keywords) : null;
  const avoids = isObject(metadata) ? asStringArray(metadata.avoids) : null;
  const palette = isObject(metadata) ? asStringArray(metadata.palette) : null;
  const styleIdValue = isObject(metadata) ? metadata.styleId : undefined;
  const styleId = styleIdValue === null ? null : asString(styleIdValue);
  const lighting = isObject(metadata) ? asString(metadata.lighting) : null;
  const mediumAndTexture = isObject(metadata) ? asString(metadata.mediumAndTexture) : null;
  const lineworkAndEdges = isObject(metadata) ? asString(metadata.lineworkAndEdges) : null;
  const compositionAndMotion = isObject(metadata) ? asString(metadata.compositionAndMotion) : null;
  let styleMetadata: { [key: string]: JsonValue } | null = null;
  try {
    const normalized = canonicalize(metadata);
    styleMetadata = isObject(normalized) ? normalized : null;
  } catch {
    styleMetadata = null;
  }
  if (
    !styleMetadata ||
    !keywords ||
    keywords.length === 0 ||
    !avoids ||
    !palette ||
    (styleIdValue !== null && styleId === null) ||
    lighting === null ||
    mediumAndTexture === null ||
    lineworkAndEdges === null ||
    compositionAndMotion === null
  ) {
    rowIssues.push(
      issue(
        index,
        catalogId,
        "INVALID_METADATA",
        "metadata must retain its linked style id, keywords, avoids, palette, and visual-language fields.",
      ),
    );
  }

  const moodTags = mood ? approvedMoodTags(mood) : [];
  if (moodTags.length === 0) {
    rowIssues.push(issue(index, catalogId, "INVALID_FIELD", "mood must yield at least one non-empty tag."));
  }

  if (rowIssues.length > 0) return { row: null, issues: rowIssues };

  const rowBase = {
    title: title as string,
    description: description as string,
    category: category as string,
    moodTags,
    keywords: keywords as string[],
    palette: palette as string[],
    lighting: lighting as string,
    mediumAndTexture: mediumAndTexture as string,
  };
  return {
    issues: [],
    row: {
      catalogId: catalogId as string,
      slug: slug as string,
      title: rowBase.title,
      description: rowBase.description,
      promptBase: promptBase as string,
      saleMode: saleMode as "exclusive" | "repeatable",
      priceCents: priceCents as number,
      currency: "USD",
      licenseVersion: "v1",
      baseObjectKey: baseObjectKey as string,
      catalogObjectKey: derivedCatalogObjectKey as string,
      styleId,
      category: rowBase.category,
      sourceOrdinal: sourceOrdinal as number | null,
      altText: altText as string,
      moodTags,
      keywords: rowBase.keywords,
      avoids: avoids as string[],
      palette: rowBase.palette,
      lighting: rowBase.lighting,
      mediumAndTexture: rowBase.mediumAndTexture,
      lineworkAndEdges: lineworkAndEdges as string,
      compositionAndMotion: compositionAndMotion as string,
      sourceSha256: sourceSha256 as string,
      sourceWidth: sourceWidth as number,
      sourceHeight: sourceHeight as number,
      sourceBytes: sourceBytes as number,
      sourceMimeType: sourceMimeType as "image/jpeg" | "image/png",
      styleMetadata: styleMetadata as { [key: string]: JsonValue },
      searchDocument: buildSearchDocument(rowBase),
    },
  };
}

function sqlString(value: string): string {
  if (value.includes("\0")) throw new TypeError("PostgreSQL text values cannot contain NUL bytes.");
  return `'${value.replaceAll("'", "''")}'`;
}

const sqlNullableString = (value: string | null): string => (value === null ? "null" : sqlString(value));
const sqlNullableInteger = (value: number | null): string => (value === null ? "null" : String(value));
const sqlTextArray = (values: string[]): string =>
  values.length === 0 ? "'{}'::text[]" : `array[${values.map(sqlString).join(", ")}]::text[]`;

function sqlValues(row: SupabaseArtworkImportRow): string {
  return [
    sqlString(row.catalogId),
    sqlString(row.slug),
    sqlString(row.title),
    sqlString(row.description),
    sqlString(row.promptBase),
    sqlString(row.saleMode),
    String(row.priceCents),
    sqlString(row.currency),
    sqlString(row.licenseVersion),
    "true",
    "transaction_timestamp()",
    "transaction_timestamp()",
    "transaction_timestamp()",
    sqlString(row.baseObjectKey),
    sqlString(row.catalogObjectKey),
    sqlNullableString(row.styleId),
    sqlString(row.category),
    sqlNullableInteger(row.sourceOrdinal),
    sqlString(row.altText),
    sqlTextArray(row.moodTags),
    sqlTextArray(row.keywords),
    sqlTextArray(row.avoids),
    sqlTextArray(row.palette),
    sqlString(row.lighting),
    sqlString(row.mediumAndTexture),
    sqlString(row.lineworkAndEdges),
    sqlString(row.compositionAndMotion),
    sqlString(row.sourceSha256),
    String(row.sourceWidth),
    String(row.sourceHeight),
    String(row.sourceBytes),
    sqlString(row.sourceMimeType),
    `${sqlString(canonicalJson(row.styleMetadata))}::jsonb`,
    sqlString(row.searchDocument),
  ].join(", ");
}

export function renderCatalogImportSql(
  rows: SupabaseArtworkImportRow[],
  sourceSha256: string,
): string {
  const header = [
    "-- GENERATED FILE. DO NOT HAND EDIT.",
    `-- Source: ${APPROVED_CATALOG_SOURCE}`,
    `-- Source SHA-256: ${sourceSha256}`,
    `-- Approved rows: ${rows.length}`,
    "-- This artifact is offline SQL only; generating it never connects to Supabase.",
    "",
  ].join("\n");
  if (rows.length === 0) return `${header}-- No approved artwork rows to import.\n`;

  const identities = rows
    .map((row) => `      (${sqlString(row.catalogId)}, ${sqlString(row.sourceSha256)})`)
    .join(",\n");
  const tuples = rows.map((row) => `  (${sqlValues(row)})`).join(",\n");
  const expectedCount = rows.length;

  return `${header}begin;\nset local standard_conforming_strings = on;\n\ndo $artcovr_identity$\nbegin\n  if exists (\n    with incoming(catalog_id, source_sha256) as (\n      values\n${identities}\n    )\n    select 1\n    from incoming i\n    join public.artworks a\n      on a.catalog_id = i.catalog_id or a.source_sha256 = i.source_sha256\n    where a.catalog_id is distinct from i.catalog_id\n       or a.source_sha256 is distinct from i.source_sha256\n  ) then\n    raise exception 'artcovr_catalog_identity_conflict';\n  end if;\nend\n$artcovr_identity$;\n\ninsert into public.artworks as current (\n  catalog_id, slug, title, description, prompt_base, sale_mode, price_cents, currency,\n  license_version, is_listed, rights_approved_at, publication_approved_at, published_at,\n  base_object_key, catalog_object_key, style_id, category, source_ordinal, alt_text,\n  mood_tags, keywords, avoids, palette, lighting, medium_and_texture, linework_and_edges,\n  composition_and_motion, source_sha256, source_width, source_height, source_bytes,\n  source_mime_type, style_metadata, search_document\n) values\n${tuples}\non conflict (catalog_id) do update set\n  slug = excluded.slug,\n  title = excluded.title,\n  description = excluded.description,\n  prompt_base = excluded.prompt_base,\n  sale_mode = excluded.sale_mode,\n  price_cents = excluded.price_cents,\n  currency = excluded.currency,\n  license_version = excluded.license_version,\n  is_listed = true,\n  rights_approved_at = coalesce(current.rights_approved_at, excluded.rights_approved_at),\n  publication_approved_at = coalesce(current.publication_approved_at, excluded.publication_approved_at),\n  published_at = coalesce(current.published_at, excluded.published_at),\n  base_object_key = excluded.base_object_key,\n  catalog_object_key = excluded.catalog_object_key,\n  style_id = excluded.style_id,\n  category = excluded.category,\n  source_ordinal = excluded.source_ordinal,\n  alt_text = excluded.alt_text,\n  mood_tags = excluded.mood_tags,\n  keywords = excluded.keywords,\n  avoids = excluded.avoids,\n  palette = excluded.palette,\n  lighting = excluded.lighting,\n  medium_and_texture = excluded.medium_and_texture,\n  linework_and_edges = excluded.linework_and_edges,\n  composition_and_motion = excluded.composition_and_motion,\n  source_width = excluded.source_width,\n  source_height = excluded.source_height,\n  source_bytes = excluded.source_bytes,\n  source_mime_type = excluded.source_mime_type,\n  style_metadata = excluded.style_metadata,\n  search_document = excluded.search_document\nwhere current.source_sha256 = excluded.source_sha256;\n\ndo $artcovr_verify$\nbegin\n  if (\n    with incoming(catalog_id, source_sha256) as (\n      values\n${identities}\n    )\n    select count(*)\n    from incoming i\n    join public.artworks a\n      on a.catalog_id = i.catalog_id and a.source_sha256 = i.source_sha256\n  ) <> ${expectedCount} then\n    raise exception 'artcovr_catalog_import_incomplete';\n  end if;\nend\n$artcovr_verify$;\n\ncommit;\n`;
}

function manifestFor(
  rows: SupabaseArtworkImportRow[],
  sourceSha256: string,
): CatalogImportManifest {
  return {
    schemaVersion: 1,
    source: APPROVED_CATALOG_SOURCE,
    sourceSha256,
    rowCount: rows.length,
    searchVector: {
      column: "public.artworks.search_vector",
      strategy: "database-generated-postgres-tsvector",
    },
    rows: rows.map((row) => ({
      catalogId: row.catalogId,
      sourceSha256: row.sourceSha256,
      title: row.title,
      description: row.description,
      keywords: [...row.keywords],
      styleId: row.styleId,
      styleMetadataSha256: sha256(canonicalJson(row.styleMetadata)),
      baseObjectKey: row.baseObjectKey,
      catalogObjectKey: row.catalogObjectKey,
    })),
  };
}

function preserveExistingListingState(sql: string): string {
  return sql.replace(
    "\n  is_listed = true,\n",
    "\n  -- An import must not relist artwork removed by a sale or operator.\n  is_listed = current.is_listed,\n",
  );
}

export function buildCatalogImport(value: unknown): CatalogImportBuild {
  const normalizedSource = Array.isArray(value)
    ? [...value].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right), "en"))
    : value;
  const sourceSha = sha256(canonicalJson(normalizedSource));
  if (!Array.isArray(value)) {
    const issues = [
      issue(-1, null, "ARTIFACT_NOT_ARRAY", `${APPROVED_CATALOG_SOURCE} must contain a JSON array.`),
    ];
    const manifest = manifestFor([], sourceSha);
    return { sourceSha256: sourceSha, rows: [], issues, sql: "", manifest };
  }

  const rows: SupabaseArtworkImportRow[] = [];
  const issues: CatalogImportIssue[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const [index, entry] of value.entries()) {
    // Delete-tier entries remain in the owner-approved artifact as immutable
    // audit history. They are not publication inputs and must never become
    // listed database rows merely because their historical rights/publication
    // booleans remain true.
    if (isRemovedAuditRow(entry)) continue;
    const result = validateRow(entry, index);
    issues.push(...result.issues);
    if (!result.row) continue;
    if (ids.has(result.row.catalogId) || hashes.has(result.row.sourceSha256)) {
      issues.push(
        issue(
          index,
          result.row.catalogId,
          "DUPLICATE_IDENTITY",
          "Each catalog id and full source SHA-256 may occur exactly once.",
        ),
      );
      continue;
    }
    ids.add(result.row.catalogId);
    hashes.add(result.row.sourceSha256);
    rows.push(result.row);
  }
  rows.sort((left, right) => left.catalogId.localeCompare(right.catalogId, "en"));

  const manifest = manifestFor(rows, sourceSha);
  const sql =
    issues.length === 0
      ? preserveExistingListingState(renderCatalogImportSql(rows, sourceSha))
      : "";
  return { sourceSha256: sourceSha, rows, issues, sql, manifest };
}

export function serializeCatalogImportManifest(manifest: CatalogImportManifest): string {
  return `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
}

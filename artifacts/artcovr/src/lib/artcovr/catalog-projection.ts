import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogImport } from "./catalog-import.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICING_OVERRIDES_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "catalog",
  "pricing-overrides.json",
);

type PricingOverride = {
  saleMode?: "exclusive" | "repeatable";
  priceCents?: number;
  tier?: "featured" | "archive" | "delete";
  rightsApproved?: true;
};

const PRICING_OVERRIDE_FIELDS = new Set([
  "saleMode",
  "priceCents",
  "tier",
  "rightsApproved",
]);

export function parsePricingOverrides(value: unknown): Map<string, PricingOverride> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Pricing overrides must be a JSON object keyed by catalog slug.");
  }
  const map = new Map<string, PricingOverride>();
  for (const [slug, entry] of Object.entries(value)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Invalid pricing override slug: ${slug}.`);
    }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Pricing override ${slug} must be an object.`);
    }
    const unknownFields = Object.keys(entry).filter((field) => !PRICING_OVERRIDE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      throw new Error(`Pricing override ${slug} contains unknown fields: ${unknownFields.join(", ")}.`);
    }
    const override = entry as Record<string, unknown>;
    if (override.saleMode !== "exclusive" && override.saleMode !== "repeatable") {
      throw new Error(`Pricing override ${slug} must specify an exclusive or repeatable saleMode.`);
    }
    if (
      typeof override.priceCents !== "number" ||
      !Number.isSafeInteger(override.priceCents) ||
      override.priceCents <= 0
    ) {
      throw new Error(`Pricing override ${slug} must specify a positive integer priceCents.`);
    }
    if (
      override.tier !== undefined &&
      override.tier !== "featured" &&
      override.tier !== "archive" &&
      override.tier !== "delete"
    ) {
      throw new Error(`Pricing override ${slug} has an invalid tier.`);
    }
    if (override.rightsApproved !== undefined && override.rightsApproved !== true) {
      throw new Error(`Pricing override ${slug} may only record rightsApproved=true.`);
    }
    map.set(slug, override as PricingOverride);
  }
  return map;
}

function loadPricingOverrides(): Map<string, PricingOverride> {
  return parsePricingOverrides(JSON.parse(readFileSync(PRICING_OVERRIDES_PATH, "utf8")) as unknown);
}

export type PublicArtworkProjection = {
  id: string;
  slug: string;
  title: string;
  image: string;
  alt: string;
  description: string;
  category: string;
  moodTags: string[];
  editionAvailable: null;
  editionTotal: null;
  licenseLabel: string;
  priceCents: number;
  saleMode: "exclusive" | "repeatable";
  rightsApproved: true;
  published: true;
  accentColor: string;
  tier: "featured" | "archive";
};

type ApprovedProjectionSource = {
  id?: unknown;
  position?: unknown;
  tier?: unknown;
};

/**
 * Owner display tier. "featured" is the only tier allowed on the home page;
 * "archive" renders on the archive page only; "delete" rows are dropped from
 * the projection entirely (and the export pruner then strips their assets).
 * A missing or unknown tier fails safe to "archive" — an unlabelled work can
 * end up in backstock by accident, but never on the front page.
 */
function tierOf(entry: ApprovedProjectionSource): "featured" | "archive" | "delete" {
  return entry.tier === "featured" || entry.tier === "delete" ? entry.tier : "archive";
}

export function projectApprovedCatalog(
  value: unknown,
  pricingOverrides: Map<string, PricingOverride> = loadPricingOverrides(),
): PublicArtworkProjection[] {
  const build = buildCatalogImport(value);
  if (build.issues.length > 0) {
    throw new Error(
      `Approved catalog cannot be projected: ${build.issues.map(({ code }) => code).join(", ")}`,
    );
  }
  if (build.rows.length === 0) {
    throw new Error("Approved catalog cannot be projected: EMPTY_APPROVED_CATALOG");
  }

  const positions = new Map<string, number>();
  const tiers = new Map<string, "featured" | "archive" | "delete">();
  for (const entry of value as ApprovedProjectionSource[]) {
    if (typeof entry.id === "string") {
      tiers.set(entry.id, tierOf(entry));
      if (Number.isSafeInteger(entry.position) && Number(entry.position) > 0) {
        positions.set(entry.id, Number(entry.position));
      }
    }
  }

  const approvedSources = new Map(
    (value as Array<Record<string, unknown>>)
      .filter((entry) => typeof entry.slug === "string")
      .map((entry) => [entry.slug as string, entry]),
  );
  for (const [slug, override] of pricingOverrides) {
    const approvedSource = approvedSources.get(slug);
    if (!approvedSource) throw new Error(`Pricing override references an unknown approved slug: ${slug}.`);
    if (override.tier !== undefined && override.tier !== tierOf(approvedSource)) {
      throw new Error(`Pricing override tier disagrees with the approved catalog for ${slug}.`);
    }
    if (override.rightsApproved === true && approvedSource.rightsApproved !== true) {
      throw new Error(`Pricing override rights approval disagrees with the approved catalog for ${slug}.`);
    }
  }

  const projected = build.rows
    .filter((row) => tiers.get(row.catalogId) !== "delete")
    .map((row) => ({ row, position: positions.get(row.catalogId) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) =>
      left.position - right.position || left.row.catalogId.localeCompare(right.row.catalogId, "en"),
    )
    .map(({ row }) => {
      const pricingOverride = pricingOverrides.get(row.slug);
      const saleMode = pricingOverride?.saleMode ?? row.saleMode;
      const priceCents = pricingOverride?.priceCents ?? row.priceCents;
      return {
        id: row.catalogId,
        slug: row.slug,
        title: row.title,
        image: `/${row.catalogObjectKey}`,
        alt: row.altText,
        description: row.description,
        category: row.category,
        moodTags: [...row.moodTags],
        editionAvailable: null,
        editionTotal: null,
        licenseLabel:
          saleMode === "exclusive"
            ? "Exclusive commercial license"
            : "Non-exclusive commercial license",
        priceCents,
        saleMode,
        rightsApproved: true as const,
        published: true as const,
        accentColor: "#0b0b0b",
        tier: (tiers.get(row.catalogId) === "featured" ? "featured" : "archive") as
          | "featured"
          | "archive",
      };
    });

  if (projected.length === 0) {
    throw new Error("Approved catalog cannot be projected: EMPTY_APPROVED_CATALOG");
  }
  return projected;
}

export function serializePublicCatalog(
  value: unknown,
  pricingOverrides?: Map<string, PricingOverride>,
): string {
  return `${JSON.stringify(projectApprovedCatalog(value, pricingOverrides), null, 2)}\n`;
}

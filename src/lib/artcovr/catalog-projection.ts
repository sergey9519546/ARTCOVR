import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalogImport } from "./catalog-import.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICING_OVERRIDES_PATH = path.resolve(__dirname, "..", "..", "catalog", "pricing-overrides.json");

type PricingOverride = {
  saleMode?: "exclusive" | "repeatable";
  priceCents?: number;
};

function loadPricingOverrides(): Map<string, PricingOverride> {
  try {
    const data = JSON.parse(readFileSync(PRICING_OVERRIDES_PATH, "utf8")) as Record<string, PricingOverride>;
    const map = new Map<string, PricingOverride>();
    for (const [slug, value] of Object.entries(data)) {
      if (typeof slug !== "string" || !slug) continue;
      if (value && typeof value === "object") map.set(slug, value);
    }
    return map;
  } catch {
    return new Map();
  }
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

export function projectApprovedCatalog(value: unknown): PublicArtworkProjection[] {
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

  const pricingOverrides = loadPricingOverrides();

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

export function serializePublicCatalog(value: unknown): string {
  return `${JSON.stringify(projectApprovedCatalog(value), null, 2)}\n`;
}

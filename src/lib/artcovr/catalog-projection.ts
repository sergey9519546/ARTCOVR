import { buildCatalogImport } from "./catalog-import.ts";

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
};

type ApprovedProjectionSource = {
  id?: unknown;
  position?: unknown;
};

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
  for (const entry of value as ApprovedProjectionSource[]) {
    if (typeof entry.id === "string" && Number.isSafeInteger(entry.position) && Number(entry.position) > 0) {
      positions.set(entry.id, Number(entry.position));
    }
  }

  return build.rows
    .map((row) => ({ row, position: positions.get(row.catalogId) ?? Number.MAX_SAFE_INTEGER }))
    .sort((left, right) =>
      left.position - right.position || left.row.catalogId.localeCompare(right.row.catalogId, "en"),
    )
    .map(({ row }) => ({
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
        row.saleMode === "exclusive"
          ? "Exclusive commercial license"
          : "Non-exclusive commercial license",
      priceCents: row.priceCents,
      saleMode: row.saleMode,
      rightsApproved: true,
      published: true,
      accentColor: "#0b0b0b",
    }));
}

export function serializePublicCatalog(value: unknown): string {
  return `${JSON.stringify(projectApprovedCatalog(value), null, 2)}\n`;
}

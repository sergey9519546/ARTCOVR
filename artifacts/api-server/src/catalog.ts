import curatedPublic from "../../artcovr/src/lib/artcovr/curated-public.json" with {
  type: "json",
};

export type PublicCatalogArtwork = {
  id: string;
  slug: string;
  title: string;
  priceCents: number | null;
  saleMode: "exclusive" | "repeatable" | null;
  rightsApproved: boolean;
  published: boolean;
};

const publicCatalog = (curatedPublic as PublicCatalogArtwork[]).filter(
  (artwork) =>
    artwork.rightsApproved &&
    artwork.published &&
    artwork.priceCents !== null &&
    artwork.saleMode !== null,
);

export function getPublicCatalog() {
  return publicCatalog;
}

export function getPublicArtworkById(artworkId: string) {
  return publicCatalog.find((artwork) => artwork.id === artworkId);
}

export function getPublicArtworkCount() {
  return publicCatalog.length;
}
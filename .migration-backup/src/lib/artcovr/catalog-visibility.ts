export type CatalogVisibility = {
  rightsApproved: boolean;
  published: boolean;
};

export function isPublicArtwork(artwork: CatalogVisibility) {
  return artwork.rightsApproved && artwork.published;
}

export function selectPublicCatalog<T extends CatalogVisibility>(items: readonly T[]) {
  return items.filter(isPublicArtwork);
}

export type SaleMode = "exclusive" | "repeatable";

export type CatalogArtwork = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  mood: string;
  priceCents: number;
  currency: "USD";
  saleMode: SaleMode;
  width: number;
  height: number;
  sha256: string;
  sourcePath: string;
  displayPath: string;
  alt: string;
  rightsApproved: boolean;
  published: boolean;
};

export type CatalogIssueCode =
  | "NOT_SQUARE"
  | "TOO_SMALL"
  | "RIGHTS_NOT_APPROVED"
  | "DUPLICATE_SHA256";

export type CatalogIssue = {
  artworkId: string;
  code: CatalogIssueCode;
  message: string;
};

const issue = (
  artwork: CatalogArtwork,
  code: CatalogIssueCode,
  message: string,
): CatalogIssue => ({ artworkId: artwork.id, code, message });

export function validateCatalog(artworks: CatalogArtwork[]): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const seenHashes = new Set<string>();

  for (const artwork of artworks) {
    if (artwork.width !== artwork.height) {
      issues.push(issue(artwork, "NOT_SQUARE", "Artwork must be square."));
    } else if (artwork.width < 1024) {
      issues.push(
        issue(artwork, "TOO_SMALL", "Artwork must be at least 1024 by 1024 pixels."),
      );
    }

    if (!artwork.rightsApproved) {
      issues.push(
        issue(artwork, "RIGHTS_NOT_APPROVED", "Commercial rights require owner approval."),
      );
    }

    const normalizedHash = artwork.sha256.toLowerCase();
    if (seenHashes.has(normalizedHash)) {
      issues.push(
        issue(artwork, "DUPLICATE_SHA256", "Another catalog entry has identical content."),
      );
    } else {
      seenHashes.add(normalizedHash);
    }
  }

  return issues;
}

export function getPublishedArtworks(artworks: CatalogArtwork[]): CatalogArtwork[] {
  return artworks.filter((artwork) => artwork.published && artwork.rightsApproved);
}

import {
  absoluteSiteUrl,
  buildArtworkCollectionStructuredData,
  buildArtworkStructuredData,
  buildFaqStructuredData,
  buildOrganizationStructuredData,
  combineStructuredData,
} from "./seo";
import { ANSWER_GUIDE_BY_PATH } from "./answer-guides";
import { displayGenreLabel, genreFromPath, hasGenreMatch } from "./genre-index";
import type { RouteMetadata } from "./route-metadata";
import type { StaticArtwork } from "./static-render";

export const FAQ_QUESTIONS = [
  ["What am I licensing?", "A commercial license to use the purchased artwork and your included generated images in commercial projects. ARTCOVR publishes and licenses the base artwork and grants you a commercial license to the purchased files. You may not claim authorship of the AI-generated result."],
  ["Can I alter the image?", "Yes. The artwork page has one freeform prompt box. Each successful generated image becomes the starting point for your next prompt, and Reset returns to the original artwork."],
  ["What is exclusive artwork?", "Exclusive artwork is reserved for one checkout at a time for about 30 minutes and removed from ARTCOVR after verified payment. Expired or failed reservations are released; a currently reserved or sold exclusive cover cannot be purchased again. Exclusivity does not assign copyright or promise worldwide uniqueness."],
  ["What is repeatable artwork?", "Repeatable artwork may be purchased by more than one customer under a non-exclusive commercial license."],
  ["Are the images AI-generated?", "Yes. The base artwork is published by ARTCOVR. Generated results are produced by a third-party AI model from your prompt and delivered under the commercial license."],
  ["Where are my images?", "Sign in to My Images to see purchases, prompts, generated images, remaining generations, expiration dates, and downloads."],
  ["What is your refund window?", "Refund requests are reviewed by the owner within a reasonable period. Approved refunds revoke the commercial license for the refunded artwork and disable unused generations and download links."],
  ["Can I resell the image file itself?", "No. Standalone resale, stock or template redistribution, and sublicensing for independent reuse are prohibited."],
  ["Can I use purchased images to train a model?", "No. AI-training use is not included in the commercial license."],
] as const;

export type RouteStructuredDataContext = {
  artworks: readonly StaticArtwork[];
  homepageArtworks?: readonly StaticArtwork[];
  siteUrl: string;
  metadata: RouteMetadata;
  getGenres: (artwork: StaticArtwork) => readonly string[];
};

/** Used by both the prerendered document and the interactive route head. */
export function buildRouteStructuredData(context: RouteStructuredDataContext) {
  const { artworks, homepageArtworks, siteUrl, metadata, getGenres } = context;
  const organization = buildOrganizationStructuredData(siteUrl);
  const collection = (
    items: readonly StaticArtwork[],
    name: string,
    breadcrumbs?: { name: string; path: string }[],
  ) => combineStructuredData(
    organization,
    buildArtworkCollectionStructuredData(items, siteUrl, {
      path: metadata.path,
      name,
      description: metadata.description,
      breadcrumbs,
    }),
  );

  if (metadata.path === "/") {
    return collection(
      homepageArtworks ?? artworks.filter((artwork) => artwork.tier !== "archive").slice(0, 12),
      "ARTCOVR curated cover art",
    );
  }
  if (metadata.path === "/faq") {
    return combineStructuredData(
      organization,
      buildFaqStructuredData(
        FAQ_QUESTIONS.map(([question, answer]) => ({ question, answer })),
        siteUrl,
      ),
    );
  }
  const guide = ANSWER_GUIDE_BY_PATH.get(metadata.path);
  if (guide) {
    const guideUrl = absoluteSiteUrl(metadata.path, siteUrl);
    const organizationId = `${siteUrl}#organization`;
    return combineStructuredData(
      organization,
      {
        "@type": "WebPage",
        "@id": `${guideUrl}#webpage`,
        url: guideUrl,
        name: metadata.title,
        description: metadata.description,
        isPartOf: { "@id": `${siteUrl}#website` },
        about: guide.eyebrow,
        mainEntity: { "@id": `${guideUrl}#faq` },
      },
      {
        "@type": "Article",
        "@id": `${guideUrl}#article`,
        headline: guide.title,
        description: metadata.description,
        url: guideUrl,
        datePublished: guide.datePublished,
        dateModified: guide.lastReviewed,
        author: { "@id": organizationId },
        publisher: { "@id": organizationId },
        mainEntityOfPage: { "@id": `${guideUrl}#webpage` },
        citation: guide.sources.map((source) => ({
          "@type": "CreativeWork",
          name: source.title,
          publisher: { "@type": "Organization", name: source.publisher },
          url: siteUrl ? absoluteSiteUrl(source.href, siteUrl) : source.href,
          description: source.description,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${guideUrl}#faq`,
        url: guideUrl,
        mainEntity: guide.sections.map((section) => ({
          "@type": "Question",
          name: section.heading,
          acceptedAnswer: { "@type": "Answer", text: section.answer },
        })),
      },
    );
  }
  if (metadata.path === "/archive") {
    return collection(artworks, "ARTCOVR cover art archive");
  }
  if (metadata.path === "/cover-art") {
    return collection(artworks, "ARTCOVR music cover art by genre");
  }
  const genre = genreFromPath(metadata.path);
  if (genre) {
    return collection(
      artworks.filter((artwork) => hasGenreMatch(artwork, genre, getGenres)),
      `${displayGenreLabel(genre)} cover art`,
      [
        { name: "Music cover art by genre", path: "/cover-art" },
        { name: displayGenreLabel(genre), path: metadata.path },
      ],
    );
  }
  const pageUrl = absoluteSiteUrl(metadata.path, siteUrl);
  const webpage = {
    "@type": "WebPage",
    "@id": `${pageUrl}#webpage`,
    url: pageUrl,
    name: metadata.title,
    description: metadata.description,
    isPartOf: { "@id": `${siteUrl}#website` },
  };
  if (metadata.path.startsWith("/product/")) {
    let artwork: StaticArtwork | undefined;
    try {
      const slug = decodeURIComponent(metadata.path.slice("/product/".length));
      artwork = artworks.find((candidate) => candidate.slug === slug);
    } catch {
      // Malformed paths receive the same generic page graph as other not-found routes.
    }
    if (artwork) {
      return combineStructuredData(
        organization,
        buildArtworkStructuredData({ ...artwork, genres: [...getGenres(artwork)] }, siteUrl),
        {
          ...webpage,
          breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
          mainEntity: { "@id": `${pageUrl}#artwork` },
          primaryImageOfPage: { "@id": `${pageUrl}#artwork` },
        },
      );
    }
  }
  return combineStructuredData(organization, webpage);
}

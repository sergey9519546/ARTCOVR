export function getSiteUrl(value = import.meta.env.VITE_SITE_URL): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.hash = "";
    url.search = "";
    url.pathname = "/";
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function absoluteSiteUrl(path = "/", siteUrl = getSiteUrl()): string {
  if (!siteUrl) return path.startsWith("/") ? path : `/${path}`;
  const url = new URL(path, `${siteUrl}/`);
  return url.protocol === "http:" || url.protocol === "https:"
    ? url.toString()
    : `${siteUrl}/`;
}

type SearchIndexingEnvironment = {
  ARTCOVR_ALLOW_INDEXING?: string;
  VITE_ARTCOVR_PRIVATE_STAGING?: string;
};

export function isSearchIndexingDisabled(
  env: SearchIndexingEnvironment = import.meta.env as SearchIndexingEnvironment,
): boolean {
  return (
    env.ARTCOVR_ALLOW_INDEXING === "0" ||
    env.VITE_ARTCOVR_PRIVATE_STAGING === "1"
  );
}

/**
 * JSON.stringify alone permits `<`, which lets catalog metadata terminate an
 * application/ld+json script element. Escaping HTML-significant code points
 * preserves valid JSON while keeping user/catalog strings inside the script.
 */
export function serializeJsonLd(value: unknown): string {
  const serialized = JSON.stringify(value) ?? "null";
  return serialized
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function combineStructuredData(
  ...values: Record<string, unknown>[]
) {
  return {
    "@context": "https://schema.org",
    "@graph": values.flatMap((value) =>
      Array.isArray(value["@graph"]) ? value["@graph"] : [value],
    ),
  };
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
  image?: { url: string; alt: string };
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
  image,
}: PageMetadataOptions) {
  const canonical = absoluteSiteUrl(path);
  const images = image ? [{ url: image.url, alt: image.alt }] : undefined;
  const canIndex = index && !isSearchIndexingDisabled();

  return {
    title,
    description,
    alternates: canIndex ? { canonical } : { canonical: null },
    robots: canIndex
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true, noimageindex: true },
    openGraph: {
      type: "website",
      url: canonical,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image.url] : undefined,
    },
  };
}

export type ArtworkStructuredDataInput = {
  slug: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  category?: string;
  priceCents: number | null;
  rightsApproved: boolean;
  published: boolean;
  saleMode?: "exclusive" | "repeatable" | null;
  creatorName?: string | null;
  genres?: string[];
  moodTags?: string[];
};

export const ARTWORK_IMAGE_WIDTH = 1200;
export const ARTWORK_IMAGE_HEIGHT = 1200;

function artworkImageDerivative(image: string, suffix: "" | "-640") {
  if (!image.startsWith("/assets/artworks/") || !image.endsWith(".jpg")) {
    return image;
  }
  const filename = image.slice("/assets/artworks/".length, -".jpg".length);
  return `/assets/artworks/optimized/${filename}${suffix}.webp`;
}

export function buildArtworkImageObject(
  artwork: ArtworkStructuredDataInput,
  siteUrl = getSiteUrl(),
  options: { representativeOfPage?: boolean } = {},
) {
  const productUrl = absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl);
  const imageUrl = absoluteSiteUrl(artwork.image, siteUrl);
  const keywords = [
    ...(artwork.genres ?? []),
    artwork.category,
    ...(artwork.moodTags ?? []),
  ].filter((value): value is string => Boolean(value));

  return {
    "@type": "ImageObject",
    "@id": `${productUrl}#artwork`,
    name: `${artwork.title} cover artwork`,
    description: artwork.description,
    contentUrl: imageUrl,
    url: imageUrl,
    thumbnailUrl: absoluteSiteUrl(
      artworkImageDerivative(artwork.image, "-640"),
      siteUrl,
    ),
    encodingFormat: "image/jpeg",
    width: ARTWORK_IMAGE_WIDTH,
    height: ARTWORK_IMAGE_HEIGHT,
    caption: artwork.alt,
    alternativeHeadline: artwork.alt,
    representativeOfPage: options.representativeOfPage ?? false,
    creditText: "ARTCOVR",
    copyrightNotice: "ARTCOVR",
    copyrightHolder: { "@id": `${siteUrl}#organization` },
    publisher: { "@id": `${siteUrl}#organization` },
    license: absoluteSiteUrl("/license", siteUrl),
    acquireLicensePage: productUrl,
    ...(keywords.length ? { keywords: keywords.join(", ") } : {}),
  };
}

export function buildArtworkStructuredData(
  artwork: ArtworkStructuredDataInput,
  siteUrl = getSiteUrl(),
) {
  const productUrl = absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl);
  const imageObject = {
    ...buildArtworkImageObject(artwork, siteUrl, {
      representativeOfPage: true,
    }),
    ...(artwork.creatorName
      ? { creator: { "@type": "Person", name: artwork.creatorName } }
      : {}),
  };
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${productUrl}#breadcrumb`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Archive",
        item: absoluteSiteUrl("/archive", siteUrl),
      },
      { "@type": "ListItem", position: 2, name: artwork.title, item: productUrl },
    ],
  };
  const canPurchase =
    artwork.published && artwork.rightsApproved && artwork.priceCents !== null;
  const product = canPurchase
    ? {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: artwork.title,
        description: artwork.description,
        image: { "@id": `${productUrl}#artwork` },
        url: productUrl,
         ...(artwork.genres?.length
           ? { category: artwork.genres.join(", ") }
           : artwork.category
             ? { category: artwork.category }
             : {}),
         sku: artwork.slug,
         brand: { "@id": `${siteUrl}#organization` },
         ...(artwork.genres?.length || artwork.moodTags?.length
           ? {
               keywords: [...(artwork.genres ?? []), ...(artwork.moodTags ?? [])].join(", "),
             }
           : {}),
        offers: {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "USD",
          price: (artwork.priceCents! / 100).toFixed(2),
          availability: "https://schema.org/InStock",
          seller: { "@id": `${siteUrl}#organization` },
          ...(artwork.saleMode
            ? { description: artwork.saleMode === "exclusive" ? "Exclusive commercial license" : "Non-exclusive commercial license" }
            : {}),
        },
      }
    : null;

  return {
    "@context": "https://schema.org",
    "@graph": [imageObject, breadcrumb, ...(product ? [product] : [])],
  };
}

export function buildArtworkCollectionStructuredData(
  artworks: readonly ArtworkStructuredDataInput[],
  siteUrl = getSiteUrl(),
  options: {
    path?: string;
    name?: string;
    description?: string;
  } = {},
) {
  const path = options.path ?? "/archive";
  const collectionUrl = absoluteSiteUrl(path, siteUrl);
  const imageObjects = artworks.map((artwork) =>
    buildArtworkImageObject(artwork, siteUrl),
  );

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["CollectionPage", "WebPage"],
        "@id": `${collectionUrl}#collection`,
        url: collectionUrl,
        name: options.name ?? "ARTCOVR cover art archive",
        description:
          options.description ??
          "A searchable archive of owner-approved square cover artwork organized by genre, mood, color, and visual topic.",
        isPartOf: { "@id": `${siteUrl}#website` },
        about: {
          "@type": "Thing",
          name: "Cover artwork for music releases",
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: artworks.length,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          itemListElement: artworks.map((artwork, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: artwork.title,
            url: absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl),
            image: { "@id": `${absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl)}#artwork` },
          })),
        },
        associatedMedia: imageObjects.map((image) => ({ "@id": image["@id"] })),
      },
      ...imageObjects,
    ],
  };
}

export function buildOrganizationStructuredData(siteUrl = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        name: "ARTCOVR",
        url: siteUrl,
        logo: absoluteSiteUrl("/icon-512.png", siteUrl),
        description:
          "ARTCOVR is a storefront for owner-approved cover artwork with commercial licensing and prompt-based image editing.",
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        name: "ARTCOVR",
        url: siteUrl,
        description:
          "Browse distinctive square cover art, review commercial license terms, and shape purchased artwork with a prompt.",
        publisher: { "@id": `${siteUrl}#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/archive?query={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export type FaqStructuredDataItem = {
  question: string;
  answer: string;
};

export function buildFaqStructuredData(
  questions: readonly FaqStructuredDataItem[],
  siteUrl = getSiteUrl(),
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${absoluteSiteUrl("/faq", siteUrl)}#faq`,
    mainEntity: questions.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

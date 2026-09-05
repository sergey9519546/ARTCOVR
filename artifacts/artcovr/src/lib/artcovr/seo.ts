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

export function buildArtworkStructuredData(
  artwork: ArtworkStructuredDataInput,
  siteUrl = getSiteUrl(),
) {
  const productUrl = absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl);
  const imageUrl = absoluteSiteUrl(artwork.image, siteUrl);
  const imageObject = {
    "@type": "ImageObject",
    "@id": `${productUrl}#artwork`,
    name: artwork.title,
    description: artwork.description,
    contentUrl: imageUrl,
    caption: artwork.alt,
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

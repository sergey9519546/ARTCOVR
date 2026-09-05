import type { Artwork } from "./artworks.ts";

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => XML_ENTITIES[character]);
}

function cleanSiteUrl(siteUrl: string) {
  return siteUrl.replace(/\/+$/, "");
}

function canonicalUrl(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function saleAvailability(saleMode: Artwork["saleMode"]) {
  if (saleMode === "exclusive") {
    return {
      saleMode: "exclusive" as const,
      availability: "available" as const,
      license: "exclusive commercial license",
    };
  }
  if (saleMode === "repeatable") {
    return {
      saleMode: "repeatable" as const,
      availability: "available" as const,
      license: "repeatable non-exclusive commercial license",
    };
  }
  return {
    saleMode: "unknown" as const,
    availability: "unknown" as const,
    license: "license terms pending",
  };
}

/**
 * Creates a versioned, machine-readable catalog from the already-public item
 * projection passed by the caller. It deliberately has no catalog imports or
 * creator fallback: an uncredited creator must remain absent rather than be
 * inferred from the publisher or licensor.
 */
export function buildCatalogFactsJson(
  items: readonly (
    Pick<
      Artwork,
      "slug" | "title" | "description" | "category" | "image" | "moodTags" | "saleMode" | "priceCents"
    > & { genres?: string[] }
  )[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const licenseUrl = canonicalUrl(base, "/license");
  const organization = {
    name: "ARTCOVR",
    url: base,
    roles: ["publisher", "licensor"],
  };
  const catalog = items.map((item) => {
    const sale = saleAvailability(item.saleMode);
    return {
      url: canonicalUrl(base, `/product/${encodeURIComponent(item.slug)}`),
      title: item.title,
      description: item.description,
      category: item.category,
      genres: item.genres ?? [],
      moods: item.moodTags,
      imageUrl: canonicalUrl(base, item.image),
      licenseUrl,
      price: item.priceCents === null
        ? null
        : { amount: item.priceCents / 100, currency: "USD" },
      currency: "USD",
      saleMode: sale.saleMode,
      availability: sale.availability,
      license: sale.license,
      publisher: organization,
      licensor: organization,
      aiGeneration: {
        disclosed: true,
        statement:
          "ARTCOVR publishes and licenses the base artwork. Prompt-based generated results are produced by a third-party AI model and licensed commercially.",
      },
    };
  });

  return JSON.stringify({
    version: "artcovr-catalog-facts/v1",
    organization,
    licenseUrl,
    items: catalog,
  });
}

export function buildSitemapXml(
  items: readonly Pick<Artwork, "slug" | "title" | "image" | "alt">[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const routes: Array<{
    path: string;
    changefreq: string;
    priority: string;
    image?: Pick<Artwork, "slug" | "title" | "image" | "alt">;
  }> = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/archive", changefreq: "weekly", priority: "0.9" },
    { path: "/about", changefreq: "monthly", priority: "0.6" },
    { path: "/faq", changefreq: "monthly", priority: "0.7" },
    { path: "/license", changefreq: "monthly", priority: "0.6" },
    { path: "/refunds", changefreq: "monthly", priority: "0.5" },
    { path: "/contact", changefreq: "monthly", priority: "0.5" },
    { path: "/guides/cover-art-licensing", changefreq: "monthly", priority: "0.7" },
    { path: "/guides/exclusive-cover-art", changefreq: "monthly", priority: "0.7" },
    { path: "/guides/ai-generated-cover-art", changefreq: "monthly", priority: "0.7" },
    { path: "/legal/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/legal/terms", changefreq: "yearly", priority: "0.3" },
    ...items.map((item) => ({
      path: `/product/${encodeURIComponent(item.slug)}`,
      changefreq: "monthly",
      priority: "0.7",
      image: item,
    })),
  ];

  const urls = routes
    .map(
      ({ path, changefreq, priority, image }) => {
        const imageXml = image
          ? `<image:image><image:loc>${escapeXml(`${base}${image.image}`)}</image:loc><image:title>${escapeXml(`${image.title} cover artwork`)}</image:title><image:caption>${escapeXml(image.alt)}</image:caption><image:license>${escapeXml(`${base}/license`)}</image:license></image:image>`
          : "";
        return `  <url><loc>${escapeXml(`${base}${path}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority>${imageXml}</url>`;
      },
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
}

export function buildLlmsTxt(
  items: readonly (Pick<Artwork, "slug" | "title" | "description" | "category"> & {
    genres?: string[];
  })[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const catalog = items
    .map(
      (item) =>
        `- [${item.title}](${base}/product/${encodeURIComponent(item.slug)}): ${item.genres?.join(", ") || item.category} cover artwork. ${item.description}`,
    )
    .join("\n");
  return `# ARTCOVR

> ARTCOVR is a curated storefront for distinctive square cover artwork. Customers can review a published work's commercial license, purchase it through verified checkout, and shape the artwork with prompt-based image editing.

ARTCOVR's public catalog contains ${items.length} owner-approved works. Public artwork pages are the source of truth for title, visual category, description, availability, pricing, and license terms.

## Primary pages

- [Browse the complete cover art archive](${base}/archive)
- [About ARTCOVR](${base}/about)
- [Cover art licensing FAQ](${base}/faq)
- [Commercial cover art license](${base}/license)
- [Refunds and digital delivery](${base}/refunds)
- [Contact ARTCOVR](${base}/contact)
- [Terms of use](${base}/legal/terms)
- [Privacy policy](${base}/legal/privacy)
- [How to license cover art](${base}/guides/cover-art-licensing)
- [Exclusive cover art explained](${base}/guides/exclusive-cover-art)
- [AI-generated cover art rights](${base}/guides/ai-generated-cover-art)

## Catalog

${catalog}
`;
}

export function buildLlmsFullTxt(
  items: readonly (
    Pick<
      Artwork,
      "slug" | "title" | "description" | "category" | "image" | "alt" | "moodTags" | "saleMode" | "priceCents"
    > & { genres?: string[] }
  )[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const records = items
    .map((item) => {
      const price =
        item.priceCents === null ? "pricing pending" : `$${(item.priceCents / 100).toFixed(2)} USD`;
      const sale = saleAvailability(item.saleMode);
      return `## ${item.title}

- URL: ${base}/product/${encodeURIComponent(item.slug)}
- Description: ${item.description}
- Image alt text: ${item.alt}
- Image URL: ${base}${item.image}
- Image license: ${base}/license
- Visual category: ${item.category}
- Music genres: ${item.genres?.join(", ") || "Experimental"}
- Mood: ${item.moodTags.join(", ")}
- Availability: ${price}; ${sale.license}; ${sale.availability}
`;
    })
    .join("\n");
  return `# ARTCOVR Public Catalog

This document describes the ${items.length} public, owner-approved ARTCOVR cover artworks. It is generated from the same projection used by the storefront.

${records}`;
}
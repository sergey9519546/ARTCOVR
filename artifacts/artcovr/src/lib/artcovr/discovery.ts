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

export function buildSitemapXml(
  items: readonly Pick<Artwork, "slug">[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const routes = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/archive", changefreq: "weekly", priority: "0.9" },
    { path: "/about", changefreq: "monthly", priority: "0.6" },
    { path: "/faq", changefreq: "monthly", priority: "0.7" },
    { path: "/license", changefreq: "monthly", priority: "0.6" },
    { path: "/refunds", changefreq: "monthly", priority: "0.5" },
    { path: "/contact", changefreq: "monthly", priority: "0.5" },
    { path: "/legal/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/legal/terms", changefreq: "yearly", priority: "0.3" },
    ...items.map((item) => ({
      path: `/product/${encodeURIComponent(item.slug)}`,
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];

  const urls = routes
    .map(
      ({ path, changefreq, priority }) =>
        `  <url><loc>${escapeXml(`${base}${path}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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

## Catalog

${catalog}
`;
}

export function buildLlmsFullTxt(
  items: readonly (
    Pick<
      Artwork,
      "slug" | "title" | "description" | "category" | "alt" | "moodTags" | "saleMode" | "priceCents"
    > & { genres?: string[] }
  )[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const records = items
    .map((item) => {
      const price =
        item.priceCents === null ? "pricing pending" : `$${(item.priceCents / 100).toFixed(2)} USD`;
      const license =
        item.saleMode === "exclusive"
          ? "exclusive commercial license"
          : "repeatable non-exclusive commercial license";
      return `## ${item.title}

- URL: ${base}/product/${encodeURIComponent(item.slug)}
- Description: ${item.description}
- Image alt text: ${item.alt}
- Visual category: ${item.category}
- Music genres: ${item.genres?.join(", ") || "Experimental"}
- Mood: ${item.moodTags.join(", ")}
- Availability: ${price}; ${license}
`;
    })
    .join("\n");
  return `# ARTCOVR Public Catalog

This document describes the ${items.length} public, owner-approved ARTCOVR cover artworks. It is generated from the same projection used by the storefront.

${records}`;
}
import type { MetadataRoute } from "next";

export const dynamic = "force-static";
import { displayArtworks } from "@/lib/artcovr/artworks";
import {
  absoluteSiteUrl,
  getSiteUrl,
  isSearchIndexingDisabled,
} from "@/lib/artcovr/seo";

const PUBLIC_ROUTES = [
  ["/", "weekly", 1],
  ["/archive", "weekly", 0.9],
  ["/about", "monthly", 0.6],
  ["/faq", "monthly", 0.6],
  ["/license", "monthly", 0.6],
  ["/refunds", "monthly", 0.5],
  ["/contact", "monthly", 0.5],
  ["/legal/privacy", "yearly", 0.3],
  ["/legal/terms", "yearly", 0.3],
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (isSearchIndexingDisabled()) return [];
  const siteUrl = getSiteUrl();

  return [
    ...PUBLIC_ROUTES.map(([path, changeFrequency, priority]) => ({
      url: absoluteSiteUrl(path, siteUrl),
      changeFrequency,
      priority,
    })),
    ...displayArtworks.map((artwork) => ({
      url: absoluteSiteUrl(`/product/${artwork.slug}`, siteUrl),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}

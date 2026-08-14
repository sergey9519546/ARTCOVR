import type { MetadataRoute } from "next";

export const dynamic = "force-static";
import {
  absoluteSiteUrl,
  getSiteUrl,
  isSearchIndexingDisabled,
} from "@/lib/artcovr/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  if (isSearchIndexingDisabled()) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      host: siteUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/checkout/",
          "/my-images",
          "/sign-in",
        ],
      },
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml", siteUrl),
    host: siteUrl,
  };
}

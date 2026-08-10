import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://outfit.hellohello.is";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/bag`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/shipping-and-return`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}

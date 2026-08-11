import type { MetadataRoute } from "next";
import { productsRow1, productsRow2, productsRow3, productsRow4 } from "@/lib/outfit/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://outfit.hellohello.is";
  const now = new Date();
  const routes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/bag`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/shipping-and-return`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
  const allProducts = [...productsRow1, ...productsRow2, ...productsRow3, ...productsRow4];
  for (const p of allProducts) {
    routes.push({ url: `${base}/product/${p.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.7 });
  }
  return routes;
}

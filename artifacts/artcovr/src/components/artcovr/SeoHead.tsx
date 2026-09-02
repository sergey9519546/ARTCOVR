import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  absoluteSiteUrl,
  getSiteUrl,
  isSearchIndexingDisabled,
} from "@/lib/artcovr/seo";
import {
  displayArtworks,
  getArtworkGenres,
  displayGenreLabel,
} from "@/lib/artcovr/artworks";
import { getRouteMetadata } from "@/lib/artcovr/route-metadata";

function routePath(location: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = location.split("?")[0] || "/";
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  );
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    element.dataset.artcovrSeo = "true";
    document.head.appendChild(element);
  }
  element.content = content;
}

function updateCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    link.dataset.artcovrSeo = "true";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function SeoHead() {
  const [location] = useLocation();

  useEffect(() => {
    const path = routePath(location);
    const metadata = getRouteMetadata(path, displayArtworks, (artwork) =>
      getArtworkGenres(artwork).map(displayGenreLabel),
    );
    const siteUrl = getSiteUrl();
    const canonical = absoluteSiteUrl(metadata.path, siteUrl);
    const catalogRoute =
      metadata.path === "/" ||
      metadata.path === "/archive" ||
      metadata.path.startsWith("/product/");
    const shouldIndex =
      metadata.index &&
      !isSearchIndexingDisabled() &&
      (!catalogRoute || displayArtworks.length > 0);
    const imageUrl = metadata.image
      ? absoluteSiteUrl(metadata.image.url, siteUrl)
      : absoluteSiteUrl("/og-image.png", siteUrl);
    const imageAlt = metadata.image?.alt ?? "ARTCOVR curated cover art";

    document.title = metadata.title;
    upsertMeta("name", "description", metadata.description);
    upsertMeta("name", "robots", shouldIndex ? "index, follow" : "noindex, nofollow, noarchive");
    upsertMeta("property", "og:title", metadata.title);
    upsertMeta("property", "og:description", metadata.description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:site_name", "ARTCOVR");
    upsertMeta("property", "og:locale", "en_US");
    upsertMeta("property", "og:type", metadata.path.startsWith("/product/") ? "product" : "website");
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:alt", imageAlt);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", metadata.title);
    upsertMeta("name", "twitter:description", metadata.description);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertMeta("name", "twitter:image:alt", imageAlt);
    updateCanonical(canonical);
  }, [location]);

  return null;
}
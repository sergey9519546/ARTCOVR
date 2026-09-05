import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  getSiteUrl,
  isSearchIndexingDisabled,
} from "@/lib/artcovr/seo";
import {
  displayArtworks,
  getArtworkGenres,
  displayGenreLabel,
} from "@/lib/artcovr/artworks";
import {
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "@/lib/artcovr/route-metadata";

function routePath(location: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = location.split("?")[0] || "/";
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (base && normalizedPathname.startsWith(base)) {
    return normalizedPathname.slice(base.length) || "/";
  }
  return normalizedPathname;
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

function updateImageSource(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="image_src"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "image_src";
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
    const social = getSocialPreviewMetadata(metadata, siteUrl);
    const catalogRoute =
      metadata.path === "/" ||
      metadata.path === "/archive" ||
      metadata.path.startsWith("/product/");
    const shouldIndex =
      metadata.index &&
      !isSearchIndexingDisabled() &&
      (!catalogRoute || displayArtworks.length > 0);
    // Static route rendering puts JSON-LD in the document head for crawlers.
    // The interactive pages render their own route-specific JSON-LD in the
    // page body, so remove the prerendered copy after the SPA mounts. React
    // then removes the body copy naturally when the route changes.
    document.head
      .querySelectorAll<HTMLScriptElement>(
        'script[type="application/ld+json"][data-artcovr-static-structured-data="true"]',
      )
      .forEach((script) => script.remove());

    document.title = social.title;
    upsertMeta("name", "description", social.description);
    upsertMeta("name", "robots", shouldIndex ? "index, follow" : "noindex, nofollow, noarchive");
    upsertMeta("property", "og:title", social.title);
    upsertMeta("property", "og:description", social.description);
    upsertMeta("property", "og:url", social.canonical);
    upsertMeta("property", "og:site_name", "ARTCOVR");
    upsertMeta("property", "og:locale", "en_US");
    upsertMeta("property", "og:type", social.openGraphType);
    upsertMeta("property", "og:image", social.imageUrl);
    upsertMeta("property", "og:image:secure_url", social.imageUrl);
    upsertMeta("property", "og:image:alt", social.imageAlt);
    upsertMeta("property", "og:image:width", String(social.imageWidth));
    upsertMeta("property", "og:image:height", String(social.imageHeight));
    upsertMeta("property", "og:image:type", social.imageType);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", social.title);
    upsertMeta("name", "twitter:description", social.description);
    upsertMeta("name", "twitter:image", social.imageUrl);
    upsertMeta("name", "twitter:image:alt", social.imageAlt);
    updateCanonical(social.canonical);
    updateImageSource(social.imageUrl);
  }, [location]);

  return null;
}
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  getSiteUrl,
  isSearchIndexingDisabled,
  serializeJsonLd,
} from "@/lib/artcovr/seo";
import {
  displayArtworks,
  featuredArtworks,
  getArtworkGenres,
  displayGenreLabel,
} from "@/lib/artcovr/artworks";
import {
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "@/lib/artcovr/route-metadata";

const routeSchemaSelector =
  'script[type="application/ld+json"][data-artcovr-static-structured-data="true"], script[type="application/ld+json"][data-artcovr-route-structured-data="true"]';

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
    // Keep guide content/schema builders outside the homepage entry bundle.
    // Cancellation prevents a delayed import from publishing a previous route.
    document.head.querySelectorAll<HTMLScriptElement>(routeSchemaSelector)
      .forEach((script) => {
        if (script.dataset.artcovrStructuredDataPath !== metadata.path) script.remove();
      });
    let cancelled = false;
    void import("@/lib/artcovr/route-structured-data")
      .then(({ buildRouteStructuredData }) => {
        if (cancelled) return;
        // Adopt the static script on mount and replace its graph on navigation.
        const scripts = document.head.querySelectorAll<HTMLScriptElement>(routeSchemaSelector);
        const script = scripts[0] ?? document.createElement("script");
        script.type = "application/ld+json";
        script.removeAttribute("data-artcovr-static-structured-data");
        script.dataset.artcovrRouteStructuredData = "true";
        script.dataset.artcovrStructuredDataPath = metadata.path;
        script.textContent = serializeJsonLd(buildRouteStructuredData({
          artworks: displayArtworks,
          homepageArtworks: featuredArtworks.slice(0, 12),
          siteUrl,
          metadata,
          getGenres: (artwork) => getArtworkGenres(artwork).map(displayGenreLabel),
        }));
        if (!script.isConnected) document.head.appendChild(script);
        Array.from(scripts).slice(1).forEach((duplicate) => duplicate.remove());
      })
      .catch((error) => {
        if (!cancelled) console.error("Unable to update route structured data", error);
      });

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
    return () => { cancelled = true; };
  }, [location]);

  return null;
}
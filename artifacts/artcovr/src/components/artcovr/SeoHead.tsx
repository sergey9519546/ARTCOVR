import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  absoluteSiteUrl,
  getSiteUrl,
  isSearchIndexingDisabled,
} from "@/lib/artcovr/seo";
import {
  displayArtworks,
  getArtworkBySlug,
  getArtworkGenres,
  displayGenreLabel,
} from "@/lib/artcovr/artworks";

type RouteMetadata = {
  title: string;
  description: string;
  path: string;
  index: boolean;
  image?: { url: string; alt: string };
};

const STATIC_METADATA: Record<string, Omit<RouteMetadata, "path">> = {
  "/": {
    title: "ARTCOVR | Curated Cover Art",
    description:
      "ARTCOVR is a curated storefront for distinctive square cover art with commercial licensing and prompt-based editing.",
    index: true,
  },
  "/archive": {
    title: "Cover Art Archive | ARTCOVR",
    description:
      "Browse 187 owner-approved cover artworks by music genre, mood, color, and visual topic. Each published work includes clear license terms.",
    index: true,
  },
  "/about": {
    title: "About ARTCOVR | Cover Art Made Yours",
    description:
      "ARTCOVR pairs original cover artwork with prompt-based editing, commercial licensing, and downloadable images for music releases and creative projects.",
    index: true,
  },
  "/faq": {
    title: "Cover Art Licensing FAQ | ARTCOVR",
    description:
      "Find direct answers about ARTCOVR cover art licenses, exclusive and repeatable artwork, AI-generated edits, downloads, refunds, and permitted use.",
    index: true,
  },
  "/contact": {
    title: "Contact ARTCOVR | Custom Cover Art",
    description:
      "Contact ARTCOVR about a custom release, cover art licensing needs, or a published artwork. Sign in with email to send a verified inquiry.",
    index: true,
  },
  "/license": {
    title: "Commercial Cover Art License | ARTCOVR",
    description:
      "Read the ARTCOVR commercial cover art license, including permitted uses, restrictions, exclusive and repeatable artwork, duration, territory, and refunds.",
    index: true,
  },
  "/refunds": {
    title: "Digital Cover Art Refunds | ARTCOVR",
    description:
      "Review ARTCOVR’s digital cover art refund process, license revocation rules, download access, and EU and UK withdrawal information.",
    index: true,
  },
  "/legal/privacy": {
    title: "Privacy Policy | ARTCOVR",
    description:
      "Read how ARTCOVR handles account, purchase, prompt, generated-image, inquiry, and download information.",
    index: true,
  },
  "/legal/terms": {
    title: "Terms of Use | ARTCOVR",
    description:
      "Read the ARTCOVR terms for cover art purchases, Stripe payment verification, commercial licenses, generated images, downloads, refunds, and service access.",
    index: true,
  },
  "/sign-in": {
    title: "Sign In | ARTCOVR",
    description: "Sign in to access ARTCOVR purchases, generated images, prompts, and downloads.",
    index: false,
  },
  "/my-images": {
    title: "My Images | ARTCOVR",
    description: "Access your ARTCOVR purchases, generated images, prompts, and authorized downloads.",
    index: false,
  },
  "/catalog-intelligence": {
    title: "Catalog Intelligence | ARTCOVR",
    description: "Protected ARTCOVR owner workspace for aggregate visual curation insights.",
    index: false,
  },
};

function trimTitle(value: string, maxLength = 60) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function routePath(location: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = location.split("?")[0] || "/";
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || "/";
  }
  return pathname;
}

function getRouteMetadata(path: string): RouteMetadata {
  const productMatch = path.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    const artwork = getArtworkBySlug(decodeURIComponent(productMatch[1]));
    if (artwork) {
      const genres = getArtworkGenres(artwork).slice(0, 2).map(displayGenreLabel);
      return {
        title: trimTitle(`${artwork.title} | ${genres.join(" · ")} Cover Art | ARTCOVR`),
        description: `${artwork.title} is ${genres.join(" and ")} cover artwork from ARTCOVR’s approved catalog. Review its commercial license and prompt-based editing options.`,
        path,
        index: artwork.published && artwork.rightsApproved,
        image: { url: artwork.image, alt: artwork.alt },
      };
    }
  }

  const metadata = STATIC_METADATA[path] ?? {
    title: "Page Not Found | ARTCOVR",
    description: "The requested ARTCOVR page could not be found.",
    index: false,
  };
  return { ...metadata, path };
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
    const metadata = getRouteMetadata(path);
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
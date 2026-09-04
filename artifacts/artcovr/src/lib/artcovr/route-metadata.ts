export type RouteArtwork = {
  slug: string;
  title: string;
  image: string;
  alt: string;
  category: string;
  moodTags: string[];
  rightsApproved: boolean;
  published: boolean;
};

export type RouteMetadata = {
  title: string;
  description: string;
  path: string;
  index: boolean;
  image?: {
    url: string;
    alt: string;
    width?: number;
    height?: number;
    type?: string;
  };
};

export const STATIC_METADATA: Record<string, Omit<RouteMetadata, "path">> = {
  "/": {
    title: "Curated Cover Art for Music Releases and Artists | ARTCOVR",
    description:
      "ARTCOVR is a curated storefront for distinctive square cover art for music releases, with commercial licensing and prompt-based editing for artists.",
    index: true,
  },
  "/archive": {
    title: "Curated Cover Art Archive for Music Releases | ARTCOVR",
    description:
      "Browse 187 owner-approved cover artworks for music releases by genre, mood, color, and visual topic. Compare each work's commercial license and editing options.",
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
  "/sign-up": {
    title: "Create an Account | ARTCOVR",
    description: "Create an ARTCOVR account to save purchases, generate edits, and access authorized downloads.",
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
  "/auth/callback": {
    title: "Completing Sign In | ARTCOVR",
    description: "Completing your ARTCOVR sign-in.",
    index: false,
  },
  "/checkout": {
    title: "Secure Checkout | ARTCOVR",
    description: "Complete your ARTCOVR cover art purchase through secure checkout.",
    index: false,
  },
  "/bag": {
    title: "Cover Art Archive | ARTCOVR",
    description:
      "Browse owner-approved cover artwork in the ARTCOVR archive with clear commercial license terms.",
    index: false,
  },
  "/shipping-and-return": {
    title: "Digital Cover Art Refunds | ARTCOVR",
    description:
      "Review ARTCOVR’s digital cover art refund process and download access policies.",
    index: false,
  },
};

function trimTitle(value: string, maxLength = 60) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function decodeSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getRouteMetadata(
  path: string,
  artworks: readonly RouteArtwork[],
  getGenres: (artwork: RouteArtwork) => readonly string[] = (artwork) => [artwork.category],
): RouteMetadata {
  const checkoutMatch = path.match(/^\/checkout\/([^/]+)$/);
  if (checkoutMatch) {
    const artwork = artworks.find((candidate) => candidate.slug === decodeSlug(checkoutMatch[1]));
    if (artwork) {
      return {
        title: "Secure Checkout | ARTCOVR",
        description: `Complete your ${artwork.title} cover art purchase through secure checkout.`,
        path,
        index: false,
        image: {
          url: artwork.image,
          alt: artwork.alt,
          width: 1200,
          height: 1200,
          type: "image/jpeg",
        },
      };
    }
  }

  const productMatch = path.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    const artwork = artworks.find((candidate) => candidate.slug === decodeSlug(productMatch[1]));
    if (artwork) {
      const genres = getGenres(artwork).slice(0, 2);
      return {
        title: trimTitle(`${artwork.title} | ${genres.join(" · ")} Cover Art | ARTCOVR`),
        description: `${artwork.title} is ${genres.join(" and ")} cover artwork from ARTCOVR’s approved catalog. Review its commercial license and prompt-based editing options.`,
        path,
        index: artwork.published && artwork.rightsApproved,
        image: {
          url: artwork.image,
          alt: artwork.alt,
          width: 1200,
          height: 1200,
          type: "image/jpeg",
        },
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

export function getPrerenderedRoutePaths(artworks: readonly RouteArtwork[]) {
  const productPaths = artworks
    .filter((artwork) => artwork.published && artwork.rightsApproved)
    .map((artwork) => `/product/${encodeURIComponent(artwork.slug)}`);
  const checkoutPaths = artworks
    .filter((artwork) => artwork.published && artwork.rightsApproved)
    .map((artwork) => `/checkout/${encodeURIComponent(artwork.slug)}`);

  return [...new Set(["/", ...Object.keys(STATIC_METADATA), ...productPaths, ...checkoutPaths])];
}
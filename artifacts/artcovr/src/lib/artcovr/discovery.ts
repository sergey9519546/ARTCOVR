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

function canonicalUrl(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

const STATIC_AVAILABILITY_POLICY = {
  source: "static_catalog",
  exclusive:
    "live_check_required means current inventory is not known by this feed. Exclusive works may be available, reserved, or sold; verify through checkout or the protected delivery endpoint before promising a purchase.",
  repeatable:
    "available describes catalog sale eligibility for a repeatable license, not a guarantee of successful payment or delivery.",
};

function saleAvailability(saleMode: Artwork["saleMode"]) {
  if (saleMode === "exclusive") {
    return {
      saleMode: "exclusive" as const,
      availability: "live_check_required" as const,
      license: "exclusive commercial license",
    };
  }
  if (saleMode === "repeatable") {
    return {
      saleMode: "repeatable" as const,
      availability: "available" as const,
      license: "repeatable non-exclusive commercial license",
    };
  }
  return {
    saleMode: "unknown" as const,
    availability: "unknown" as const,
    license: "license terms pending",
  };
}

type AgentCatalogArtwork = Pick<
  Artwork,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "image"
  | "saleMode"
  | "priceCents"
  | "rightsApproved"
  | "published"
>;

function isAgentSaleEligible(item: AgentCatalogArtwork) {
  return (
    item.rightsApproved &&
    item.published &&
    item.priceCents !== null &&
    item.saleMode !== null
  );
}

/**
 * The machine-buyer projection is deliberately narrower than the public
 * discovery catalog: only published, rights-approved works with sale terms
 * are included. This static projection cannot establish live exclusive stock.
 * Preview images remain public, while the delivery URL always points to the
 * payment-protected endpoint.
 */
export function buildAgentCatalogJson(
  items: readonly AgentCatalogArtwork[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const licenseUrl = canonicalUrl(base, "/license");
  const saleEligible = items.filter(isAgentSaleEligible);

  return JSON.stringify({
    version: "artcovr-agent-catalog/v2",
    availabilityPolicy: STATIC_AVAILABILITY_POLICY,
    organization: {
      name: "ARTCOVR",
      url: base,
    },
    licenseUrl,
    payment: {
      protocol: "mpp",
      supportedRails: ["stripe_shared_payment_tokens"],
      minimum: {
        amountCents: 50,
        amount: 0.5,
        currency: "USD",
      },
      settlement: "stripe",
      challengeStatus: 402,
    },
    items: saleEligible.map((item) => {
      const sale = saleAvailability(item.saleMode);
      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        canonicalUrl: canonicalUrl(base, `/product/${encodeURIComponent(item.slug)}`),
        previewUrl: canonicalUrl(base, item.image),
        deliveryUrl: canonicalUrl(
          base,
          `/api/agent/artworks/${encodeURIComponent(item.slug)}/image`,
        ),
        price: {
          amountCents: item.priceCents,
          amount: item.priceCents! / 100,
          currency: "USD",
        },
        availability: sale.availability,
        saleMode: sale.saleMode,
        license: {
          name: sale.license,
          url: licenseUrl,
          scope: "commercial",
        },
      };
    }),
  });
}

/**
 * Creates a versioned, machine-readable catalog from the already-public item
 * projection passed by the caller. It deliberately has no catalog imports or
 * creator fallback: an uncredited creator must remain absent rather than be
 * inferred from the publisher or licensor.
 */
export function buildCatalogFactsJson(
  items: readonly (
    Pick<
      Artwork,
      "slug" | "title" | "description" | "category" | "image" | "moodTags" | "saleMode" | "priceCents"
    > & { genres?: string[] }
  )[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const licenseUrl = canonicalUrl(base, "/license");
  const organization = {
    name: "ARTCOVR",
    url: base,
    roles: ["publisher", "licensor"],
  };
  const catalog = items.map((item) => {
    const sale = saleAvailability(item.saleMode);
    return {
      url: canonicalUrl(base, `/product/${encodeURIComponent(item.slug)}`),
      title: item.title,
      description: item.description,
      category: item.category,
      genres: item.genres ?? [],
      moods: item.moodTags,
      imageUrl: canonicalUrl(base, item.image),
      licenseUrl,
      price: item.priceCents === null
        ? null
        : { amount: item.priceCents / 100, currency: "USD" },
      currency: "USD",
      saleMode: sale.saleMode,
      availability: sale.availability,
      license: sale.license,
      publisher: organization,
      licensor: organization,
      aiGeneration: {
        disclosed: true,
        statement:
          "ARTCOVR publishes and licenses the base artwork. Prompt-based generated results are produced by a third-party AI model and licensed commercially.",
      },
    };
  });

  return JSON.stringify({
    version: "artcovr-catalog-facts/v2",
    availabilityPolicy: STATIC_AVAILABILITY_POLICY,
    organization,
    licenseUrl,
    items: catalog,
  });
}

export function buildSitemapXml(
  items: readonly Pick<Artwork, "slug" | "title" | "image" | "alt">[],
  siteUrl: string,
  genrePaths: readonly string[] = [],
) {
  const base = cleanSiteUrl(siteUrl);
  const routes: Array<{
    path: string;
    changefreq: string;
    priority: string;
    image?: Pick<Artwork, "slug" | "title" | "image" | "alt">;
  }> = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/archive", changefreq: "weekly", priority: "0.9" },
    { path: "/cover-art", changefreq: "weekly", priority: "0.8" },
    { path: "/about", changefreq: "monthly", priority: "0.6" },
    { path: "/faq", changefreq: "monthly", priority: "0.7" },
    { path: "/license", changefreq: "monthly", priority: "0.6" },
    { path: "/refunds", changefreq: "monthly", priority: "0.5" },
    { path: "/contact", changefreq: "monthly", priority: "0.5" },
    { path: "/guides/cover-art-licensing", changefreq: "monthly", priority: "0.7" },
    { path: "/guides/exclusive-cover-art", changefreq: "monthly", priority: "0.7" },
    { path: "/guides/ai-generated-cover-art", changefreq: "monthly", priority: "0.7" },
    { path: "/guides/spotify-apple-music-cover-art-requirements", changefreq: "monthly", priority: "0.7" },
    { path: "/legal/privacy", changefreq: "yearly", priority: "0.3" },
    { path: "/legal/terms", changefreq: "yearly", priority: "0.3" },
    ...items.map((item) => ({
      path: `/product/${encodeURIComponent(item.slug)}`,
      changefreq: "monthly",
      priority: "0.7",
      image: item,
    })),
    ...genrePaths.map((path) => ({
      path,
      changefreq: "weekly",
      priority: "0.7",
    })),
  ];

  const urls = routes
    .map(
      ({ path, changefreq, priority, image }) => {
        const imageXml = image
          ? `<image:image><image:loc>${escapeXml(`${base}${image.image}`)}</image:loc><image:title>${escapeXml(`${image.title} cover artwork`)}</image:title><image:caption>${escapeXml(image.alt)}</image:caption><image:license>${escapeXml(`${base}/license`)}</image:license></image:image>`
          : "";
        return `  <url><loc>${escapeXml(`${base}${path}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority>${imageXml}</url>`;
      },
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
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
- [How to license cover art](${base}/guides/cover-art-licensing)
- [Exclusive cover art explained](${base}/guides/exclusive-cover-art)
- [AI-generated cover art rights](${base}/guides/ai-generated-cover-art)
- [Spotify and Apple Music cover art requirements](${base}/guides/spotify-apple-music-cover-art-requirements)

## Agent access

- Machine-purchase catalog: ${base}/agent-catalog.json
- Paid image access API: ${base}/api/agent/artworks/{slug}/image
- The machine-purchase catalog lists published, rights-approved works with approved prices and sale modes, stable IDs, license links, public previews, and protected delivery URLs. It is a static discovery feed, not live inventory.
- Exclusive works use live_check_required: they may be available, reserved, or sold. Verify through checkout or the protected delivery endpoint before promising a purchase. Repeatable availability describes catalog sale eligibility, not guaranteed payment or delivery.
- Send a GET request for a listed artwork slug. The endpoint returns an MPP HTTP 402 payment challenge when no valid payment credential is present, then returns the licensed original image after a successful one-time payment.
- Supported payment rail: Stripe Shared Payment Tokens through MPP. The minimum payment is $0.50 USD, and stablecoin or Tempo settlement is not configured.
- Public preview URLs are not licensed-original delivery URLs. A successful delivery is a private, no-store JPEG response; a missing artwork returns 404, an exclusive inventory conflict can return 409 artwork_unavailable, and temporary payment or delivery failures return 503.

## Catalog

${catalog}
`;
}

export function buildLlmsFullTxt(
  items: readonly (
    Pick<
      Artwork,
      "slug" | "title" | "description" | "category" | "image" | "alt" | "moodTags" | "saleMode" | "priceCents"
    > & { genres?: string[] }
  )[],
  siteUrl: string,
) {
  const base = cleanSiteUrl(siteUrl);
  const records = items
    .map((item) => {
      const price =
        item.priceCents === null ? "pricing pending" : `$${(item.priceCents / 100).toFixed(2)} USD`;
      const sale = saleAvailability(item.saleMode);
      const machineSaleEligible =
        item.priceCents !== null &&
        item.saleMode !== null;
      const machineAvailability = machineSaleEligible ? sale.availability : "unavailable";
      const machineDelivery = machineSaleEligible
        ? `${base}/api/agent/artworks/${encodeURIComponent(item.slug)}/image`
        : "not listed until price and sale mode are approved";
      return `## ${item.title}

- URL: ${base}/product/${encodeURIComponent(item.slug)}
- Description: ${item.description}
- Image alt text: ${item.alt}
- Image URL: ${base}${item.image}
- Image license: ${base}/license
- Visual category: ${item.category}
- Music genres: ${item.genres?.join(", ") || "Experimental"}
- Mood: ${item.moodTags.join(", ")}
- Price: ${price}
- Sale mode: ${sale.saleMode}
- Availability: ${sale.availability}
- Agent purchase availability: ${machineAvailability}
- Agent delivery URL: ${machineDelivery}
- License: ${sale.license}
`;
    })
    .join("\n");
  return `# ARTCOVR Public Catalog

This document describes the ${items.length} public, owner-approved ARTCOVR cover artworks. It is generated from the same projection used by the storefront.

## Machine purchasing

- Machine-purchase catalog: ${base}/agent-catalog.json
- This is a static discovery catalog, not live inventory. Exclusive availability is live_check_required: works may be available, reserved, or sold. Verify through checkout or the protected delivery endpoint before promising a purchase. Repeatable availability describes catalog sale eligibility, not guaranteed payment or delivery.
- Payment protocol: MPP with Stripe Shared Payment Tokens.
- Minimum payment: $0.50 USD. Stablecoin and Tempo settlement are not configured.
- Retry a listed delivery URL after receiving its HTTP 402 payment challenge. A successful HTTP 200 response is the licensed original image; public preview image URLs are not licensed delivery.
- HTTP 404 means the artwork is not available through agent delivery. HTTP 409 artwork_unavailable indicates an exclusive inventory conflict. HTTP 503 means payment verification or delivery is temporarily unavailable.

${records}`;
}
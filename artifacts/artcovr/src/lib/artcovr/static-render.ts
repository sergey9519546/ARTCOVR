import {
  buildArtworkCollectionStructuredData,
  buildArtworkStructuredData,
  buildFaqStructuredData,
  buildOrganizationStructuredData,
  combineStructuredData,
  serializeJsonLd,
} from "./seo";
import {
  getSocialPreviewMetadata,
  type RouteMetadata,
} from "./route-metadata";
import { ANSWER_GUIDE_BY_PATH } from "./answer-guides";

export type StaticArtwork = {
  slug: string;
  title: string;
  image: string;
  alt: string;
  description: string;
  category: string;
  moodTags: string[];
  priceCents: number | null;
  saleMode: "exclusive" | "repeatable" | null;
  rightsApproved: boolean;
  published: boolean;
  tier?: "featured" | "archive";
};

type RenderContext = {
  artworks: readonly StaticArtwork[];
  siteUrl: string;
  metadata: RouteMetadata;
  getGenres: (artwork: StaticArtwork) => readonly string[];
};

const FAQ_QUESTIONS = [
  ["What am I licensing?", "A commercial license to use the purchased artwork and your included generated images in commercial projects. ARTCOVR owns the base artwork and grants you a commercial license to the purchased files. You may not claim authorship of the AI-generated result."],
  ["Can I alter the image?", "Yes. The artwork page has one freeform prompt box. Each successful generated image becomes the starting point for your next prompt, and Reset returns to the original artwork."],
  ["What is exclusive artwork?", "Exclusive artwork is reserved for one checkout at a time for about 30 minutes and removed from ARTCOVR after verified payment. Expired or failed reservations are released; a currently reserved or sold exclusive cover cannot be purchased again. Exclusivity does not assign copyright or promise worldwide uniqueness."],
  ["What is repeatable artwork?", "Repeatable artwork may be purchased by more than one customer under a non-exclusive commercial license."],
  ["Are the images AI-generated?", "Yes. The base artwork is an original ARTCOVR composition. Generated results are produced by a third-party AI model from your prompt and delivered under the commercial license."],
  ["Where are my images?", "Sign in to My Images to see purchases, prompts, generated images, remaining generations, expiration dates, and downloads."],
  ["What is your refund window?", "Refund requests are reviewed by the owner within a reasonable period. Approved refunds revoke the commercial license for the refunded artwork and disable unused generations and download links."],
  ["Can I resell the image file itself?", "No. Standalone resale, stock or template redistribution, and sublicensing for independent reuse are prohibited."],
  ["Can I use purchased images to train a model?", "No. AI-training use is not included in the commercial license."],
] as const;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

function absoluteUrl(value: string, siteUrl: string) {
  return new URL(value, `${siteUrl}/`).toString();
}

export function renderStaticRouteMetadata(
  metadata: RouteMetadata,
  siteUrl: string,
  indexingDisabled: boolean,
) {
  const social = getSocialPreviewMetadata(metadata, siteUrl);
  const robots =
    metadata.index && !indexingDisabled
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, nofollow, noarchive";

  return `<!-- ARTCOVR_ROUTE_META_START -->
    <title>${escapeHtml(social.title)}</title>
    <meta name="description" content="${escapeHtml(social.description)}" />
    <meta name="robots" content="${robots}" />
    <meta property="og:title" content="${escapeHtml(social.title)}" />
    <meta property="og:description" content="${escapeHtml(social.description)}" />
    <meta property="og:type" content="${social.openGraphType}" />
    <meta property="og:site_name" content="ARTCOVR" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="${escapeHtml(social.canonical)}" />
    <meta property="og:image" content="${escapeHtml(social.imageUrl)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(social.imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(social.imageAlt)}" />
    <meta property="og:image:width" content="${social.imageWidth}" />
    <meta property="og:image:height" content="${social.imageHeight}" />
    <meta property="og:image:type" content="${escapeHtml(social.imageType)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(social.title)}" />
    <meta name="twitter:description" content="${escapeHtml(social.description)}" />
    <meta name="twitter:image" content="${escapeHtml(social.imageUrl)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(social.imageAlt)}" />
    <link rel="image_src" href="${escapeHtml(social.imageUrl)}" />
    <link rel="canonical" href="${escapeHtml(social.canonical)}" />
    <!-- ARTCOVR_ROUTE_META_END -->`;
}

function link(href: string, label: string, className = "link-hover") {
  return `<a href="${escapeHtml(href)}"${className ? ` class="${className}"` : ""}>${escapeHtml(label)}</a>`;
}

function siteHeader() {
  return `<header>
    <nav aria-label="Primary">
      ${link("/", "ARTCOVR", "brand-link")}
      <div>
        ${link("/archive", "Archive")}
        ${link("/about", "About")}
        ${link("/faq", "FAQ")}
        ${link("/license", "License")}
        ${link("/contact", "Contact")}
      </div>
    </nav>
  </header>`;
}

function siteFooter() {
  return `<footer>
    <p>Distinctive cover art, shaped by your prompt.</p>
    <nav aria-label="Footer">
      ${link("/archive", "Browse the archive")}
      ${link("/license", "Commercial license")}
      ${link("/guides/cover-art-licensing", "Licensing guide")}
      ${link("/guides/exclusive-cover-art", "Exclusive cover art")}
      ${link("/guides/ai-generated-cover-art", "AI art rights")}
      ${link("/refunds", "Refunds")}
      ${link("/legal/privacy", "Privacy")}
      ${link("/legal/terms", "Terms")}
    </nav>
    <p>© 2026 ARTCOVR</p>
  </footer>`;
}

function pageLayout(content: string) {
  return `${siteHeader()}${content}${siteFooter()}`;
}

function renderHome({ artworks }: RenderContext) {
  const featured = artworks.slice(0, 12);
  const cards = featured
    .map(
      (artwork) => `<li>
        <a href="/product/${encodeURIComponent(artwork.slug)}">
          <img src="${escapeHtml(artwork.image)}" alt="${escapeHtml(artwork.alt)}" width="1200" height="1200" loading="lazy" />
          <span>${escapeHtml(artwork.title)}</span>
        </a>
      </li>`,
    )
    .join("");

  return pageLayout(`<main id="page">
    <section aria-labelledby="home-title">
      <p>ARTCOVR</p>
      <h1 id="home-title">Cover art that becomes yours.</h1>
      <p>Select an artwork, describe any change in one freeform prompt, and keep iterating from the visible result. Purchase the direction you want and download your images.</p>
      <p>${link("/archive", "Explore the cover art archive")} ${link("/license", "Read the commercial license")}</p>
    </section>
    <section aria-labelledby="featured-title">
      <p>Curated collection</p>
      <h2 id="featured-title">Distinctive square cover art.</h2>
      <p>Browse owner-approved artwork for music releases and creative projects. Every published work includes clear license terms.</p>
      <ul>${cards}</ul>
      <p>${link("/archive", `Browse all ${artworks.length} cover artworks`)}</p>
    </section>
  </main>`);
}

function renderArchive({ artworks }: RenderContext) {
  const cards = artworks
    .map(
      (artwork) => `<li>
        <article>
          <a href="/product/${encodeURIComponent(artwork.slug)}">
            <img src="${escapeHtml(artwork.image)}" alt="${escapeHtml(artwork.alt)}" width="1200" height="1200" loading="lazy" />
            <h2>${escapeHtml(artwork.title)}</h2>
          </a>
          <p>${escapeHtml(artwork.description)}</p>
          <p>${escapeHtml(artwork.category)} · ${escapeHtml(artwork.moodTags.join(" · "))}</p>
        </article>
      </li>`,
    )
    .join("");

  return pageLayout(`<main id="main">
    <header>
      <p>Curated archive</p>
      <h1>Cover art.</h1>
      <p>${artworks.length} owner-approved square cover artworks, searchable by music genre, mood, color, and visual topic. Each published work has its own commercial license terms.</p>
    </header>
    <section aria-label="Artwork archive">
      <ul>${cards}</ul>
    </section>
  </main>`);
}

function renderProduct({ artworks, metadata, getGenres }: RenderContext) {
  const slug = metadata.path.match(/^\/product\/([^/]+)$/)?.[1] ?? "";
  let artwork: StaticArtwork | undefined;
  try {
    artwork = artworks.find((candidate) => candidate.slug === decodeURIComponent(slug));
  } catch {
    artwork = undefined;
  }
  if (!artwork) return renderNotFound();

  const genres = getGenres(artwork);
  const license =
    artwork.saleMode === "exclusive"
      ? "Exclusive commercial license"
      : artwork.saleMode === "repeatable"
        ? "Non-exclusive commercial license"
        : "License mode pending";
  const price =
    artwork.priceCents === null
      ? "Price pending"
      : `$${(artwork.priceCents / 100).toFixed(2)} USD`;
  const related = artworks
    .filter((candidate) => candidate.slug !== artwork.slug)
    .slice(0, 4)
    .map(
      (candidate) =>
        `<li>${link(`/product/${encodeURIComponent(candidate.slug)}`, candidate.title)}</li>`,
    )
    .join("");

  return pageLayout(`<main id="main">
    <nav aria-label="Breadcrumb">${link("/archive", "Archive")} <span aria-hidden="true">/</span> <span>${escapeHtml(artwork.title)}</span></nav>
    <header>
      <p>${escapeHtml(genres.slice(0, 2).join(" · "))} — cover artwork</p>
      <h1>${escapeHtml(artwork.title)}</h1>
    </header>
    <figure>
      <img src="${escapeHtml(artwork.image)}" alt="${escapeHtml(artwork.alt)}" width="1200" height="1200" />
      <figcaption>${escapeHtml(artwork.alt)}</figcaption>
    </figure>
    <section aria-labelledby="license-summary">
      <h2 id="license-summary">License and pricing</h2>
      <p>${escapeHtml(price)}</p>
      <p>${escapeHtml(license)}</p>
      <p>${escapeHtml(artwork.description)}</p>
      <dl>
        <div><dt>Availability</dt><dd>${artwork.priceCents !== null ? "Available" : "Pending"}</dd></div>
        <div><dt>License</dt><dd>${escapeHtml(license)}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(artwork.category)}</dd></div>
      </dl>
      <p>${link("/license", "Read the commercial cover art license")} ${link("/refunds", "Review the return policy")}</p>
    </section>
    <section aria-labelledby="related-works">
      <h2 id="related-works">Related cover artwork</h2>
      <ul>${related}</ul>
    </section>
  </main>`);
}

const INFO_CONTENT: Record<string, { eyebrow: string; title: string; body: string }> = {
  "/about": {
    eyebrow: "ARTCOVR",
    title: "Cover art made yours.",
    body: `<p>ARTCOVR starts with distinctive artwork and gives you one direct way to reshape it.</p>
      <p>Choose an artwork, describe any change in a freeform prompt, and build from each visible generated image. Published works include clear pricing, sale mode, commercial-license terms, and customer access through My Images. Images are generated with AI from original ARTCOVR compositions.</p>
      <p>${link("/archive", "Browse the archive")} ${link("/license", "Read the commercial license")}</p>`,
  },
  "/license": {
    eyebrow: "Licensing",
    title: "Clear before checkout.",
    body: `<p>A completed ARTCOVR purchase grants you a commercial license for the purchased base artwork and the clean generated images included with that purchase. You may use those images in commercial creative projects, including music releases and their promotion.</p>
      <h2>What the license does not allow</h2>
      <ul><li>Resell an image as a standalone file, or offer it through a stock, asset, or template library.</li><li>Sublicense it for others to reuse independently.</li><li>Use it to train an AI model.</li><li>Claim authorship or copyright ownership of the AI-generated result.</li></ul>
      <h2>Exclusive and repeatable artwork</h2>
      <p>Repeatable artwork may be licensed to more than one customer. For exclusive artwork, verified payment removes the work from future sale on ARTCOVR. Exclusive means removal from this storefront; it does not transfer copyright or promise that no visually similar work exists anywhere else.</p>
      <p>${link("/faq", "Read licensing questions")} ${link("/legal/terms", "Read full terms")}</p>`,
  },
  "/refunds": {
    eyebrow: "Support",
    title: "Refunds.",
    body: `<p>Refund requests are reviewed by the owner within a reasonable period. If a full refund is approved, the commercial license for the refunded artwork is revoked and unused generation access and future signed download links are disabled.</p>
      <p>Files already downloaded cannot be recalled. Refunded exclusive artwork is not automatically returned to sale.</p>
      <p>ARTCOVR is a digital-only storefront. Nothing is shipped; delivery is via signed download links in My Images.</p>
      <h2>European Union and United Kingdom</h2>
      <p>If you are in the EU or UK, you have a 14-day right to withdraw from this purchase. Because the content is delivered digitally, that right ends as soon as you download the files or generate images. By completing checkout you agree to this immediate performance and acknowledge that the withdrawal right does not apply once supply has begun.</p>
      <p>${link("/contact", "Contact ARTCOVR about a refund")}</p>`,
  },
  "/contact": {
    eyebrow: "Support",
    title: "Custom inquiry.",
    body: `<p>For a release with different needs, tell us what you are making and the artwork you are considering. Sign in with your email before sending so we can reply to the verified address on your account.</p>
      <p>${link("/sign-in", "Sign in with email")} ${link("/archive", "Browse published artwork")}</p>`,
  },
  "/legal/privacy": {
    eyebrow: "Legal",
    title: "Privacy.",
    body: `<p>ARTCOVR uses the minimum account, purchase, prompt, image, and inquiry information needed to operate the storefront. We do not sell personal information.</p>
      <h2>Information we handle</h2><p>We process your email address and authentication records; purchases, license state, and refund status; prompts and generated-image records; download and allowance state; custom-work inquiries; and basic security, performance, and diagnostic logs.</p>
      <h2>Service providers</h2><p>Supabase provides authentication, database, and private file storage. Stripe processes checkout and payment events. OpenAI receives the selected image and your prompt to produce a requested generated image.</p>
      <h2>Retention and access</h2><p>Contact ARTCOVR to request access, correction, or deletion where applicable. Purchase and license records may be retained for accounting, dispute, and legal obligations.</p>`,
  },
  "/legal/terms": {
    eyebrow: "Legal",
    title: "Terms.",
    body: `<p>These terms govern your use of ARTCOVR, individual artwork purchases, included image-generation access, and downloads. By purchasing, you agree to the license shown during checkout and these terms.</p>
      <h2>Purchases and fulfillment</h2><p>Each checkout covers one artwork at the price shown in USD. Stripe processes the payment. Access begins only after ARTCOVR verifies payment through its payment webhook; a browser success page alone does not prove fulfillment.</p>
      <h2>Artwork and generated images</h2><p>Exclusive artwork is removed from ARTCOVR after verified payment. Repeatable artwork remains available for other customers under separate non-exclusive licenses. Generated images remain subject to the commercial license and its restrictions.</p>
      <p>${link("/license", "Read the commercial license")} ${link("/refunds", "Read the refund policy")}</p>`,
  },
};

function renderInfo(path: string) {
  const content = INFO_CONTENT[path];
  if (!content) return null;
  return pageLayout(`<main id="main">
    <header><p>${escapeHtml(content.eyebrow)}</p><h1>${escapeHtml(content.title)}</h1></header>
    <article>${content.body}</article>
  </main>`);
}

function renderFaq({ siteUrl }: RenderContext) {
  const questions = FAQ_QUESTIONS.map(([question, answer]) => `<div><h2>${escapeHtml(question)}</h2><p>${escapeHtml(answer)}</p></div>`).join("");
  return pageLayout(`<main id="main">
    <header><p>Support</p><h1>FAQ.</h1></header>
    <p>ARTCOVR is a digital cover art storefront. These answers explain how commercial licensing, prompt-based editing, payment verification, and downloads work.</p>
    <section aria-label="Frequently asked questions">${questions}</section>
  </main>`);
}

function renderAnswerGuide({ artworks, metadata }: RenderContext) {
  const guide = ANSWER_GUIDE_BY_PATH.get(metadata.path);
  if (!guide) return null;
  const questions = guide.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.answer)}</p></section>`,
    )
    .join("");
  const artworkLinks = artworks
    .slice(0, 6)
    .map(
      (artwork) =>
        `<li>${link(`/product/${encodeURIComponent(artwork.slug)}`, artwork.title)}</li>`,
    )
    .join("");
  const relatedLinks = guide.links
    .map((item) => link(item.href, item.label))
    .join(" ");

  return pageLayout(`<main id="main">
    <header><p>${escapeHtml(guide.eyebrow)}</p><h1>${escapeHtml(guide.displayTitle)}</h1></header>
    <p>${escapeHtml(guide.introduction)}</p>
    <article>${questions}</article>
    <section aria-labelledby="guide-artwork"><h2 id="guide-artwork">Browse licensed cover artwork</h2><ul>${artworkLinks}</ul></section>
    <nav aria-label="Related guidance">${relatedLinks}</nav>
  </main>`);
}

function renderNoindexPage(path: string) {
  const title =
    path.startsWith("/sign-in") ? "Sign in to ARTCOVR" :
      path.startsWith("/sign-up") ? "Create an ARTCOVR account" :
        path.startsWith("/my-images") ? "My Images" :
          path.startsWith("/catalog-intelligence") ? "Catalog Intelligence" :
            path.startsWith("/checkout") ? "Secure checkout" :
              path === "/auth/callback" ? "Completing sign in" :
                "ARTCOVR";
  return pageLayout(`<main id="main"><h1>${title}</h1><p>This ARTCOVR page is available in the interactive application.</p></main>`);
}

function renderNotFound() {
  return pageLayout(`<main id="main"><h1>Page not found.</h1><p>The requested ARTCOVR page could not be found.</p><p>${link("/archive", "Browse the cover art archive")}</p></main>`);
}

function structuredDataForRoute({ artworks, siteUrl, metadata, getGenres }: RenderContext) {
  if (metadata.path === "/") {
    const featured = artworks.filter((artwork) => artwork.tier !== "archive");
    const organization = buildOrganizationStructuredData(siteUrl);
    const gallery = buildArtworkCollectionStructuredData(featured, siteUrl, {
      path: "/",
      name: "ARTCOVR curated cover art",
      description: metadata.description,
    });
    return combineStructuredData(organization, gallery);
  }
  if (metadata.path === "/faq") {
    return combineStructuredData(
      buildOrganizationStructuredData(siteUrl),
      buildFaqStructuredData(
        FAQ_QUESTIONS.map(([question, answer]) => ({ question, answer })),
        siteUrl,
      ),
    );
  }
  if (ANSWER_GUIDE_BY_PATH.has(metadata.path)) {
    const guide = ANSWER_GUIDE_BY_PATH.get(metadata.path)!;
    return combineStructuredData(
      buildOrganizationStructuredData(siteUrl),
      {
        "@type": "WebPage",
        "@id": `${absoluteUrl(metadata.path, siteUrl)}#webpage`,
        url: absoluteUrl(metadata.path, siteUrl),
        name: metadata.title,
        description: metadata.description,
        isPartOf: { "@id": `${siteUrl}#website` },
        about: guide.eyebrow,
        mainEntity: guide.sections.map((section) => ({
          "@type": "Question",
          name: section.heading,
          acceptedAnswer: {
            "@type": "Answer",
            text: section.answer,
          },
        })),
      },
    );
  }
  if (metadata.path === "/archive") {
    return combineStructuredData(
      buildOrganizationStructuredData(siteUrl),
      buildArtworkCollectionStructuredData(artworks, siteUrl, {
        path: "/archive",
        name: "ARTCOVR cover art archive",
        description: metadata.description,
      }),
    );
  }
  if (metadata.path.startsWith("/product/")) {
    const slug = metadata.path.slice("/product/".length);
    let artwork: StaticArtwork | undefined;
    try {
      artwork = artworks.find((candidate) => candidate.slug === decodeURIComponent(slug));
    } catch {
      artwork = undefined;
    }
    if (artwork) {
      const productUrl = absoluteUrl(metadata.path, siteUrl);
      return combineStructuredData(
        buildOrganizationStructuredData(siteUrl),
        buildArtworkStructuredData(
          { ...artwork, genres: [...getGenres(artwork)] },
          siteUrl,
        ),
        {
          "@type": ["ProductPage", "WebPage"],
          "@id": `${productUrl}#webpage`,
          url: productUrl,
          name: metadata.title,
          description: metadata.description,
          isPartOf: { "@id": `${siteUrl}#website` },
          breadcrumb: { "@id": `${productUrl}#breadcrumb` },
          mainEntity: { "@id": `${productUrl}#product` },
          primaryImageOfPage: { "@id": `${productUrl}#artwork` },
        },
      );
    }
  }
  return combineStructuredData(
    buildOrganizationStructuredData(siteUrl),
    {
      "@type": "WebPage",
      "@id": `${absoluteUrl(metadata.path, siteUrl)}#webpage`,
      url: absoluteUrl(metadata.path, siteUrl),
      name: metadata.title,
      description: metadata.description,
      isPartOf: { "@id": `${siteUrl}#website` },
    },
  );
}

export function renderStaticRoute(context: RenderContext) {
  const { metadata } = context;
  let body = renderInfo(metadata.path);
  if (metadata.path === "/") body = renderHome(context);
  if (metadata.path === "/archive") body = renderArchive(context);
  if (metadata.path === "/faq") body = renderFaq(context);
  if (ANSWER_GUIDE_BY_PATH.has(metadata.path)) body = renderAnswerGuide(context);
  if (metadata.path.startsWith("/product/")) body = renderProduct(context);
  if (
    !body &&
    (metadata.path.startsWith("/sign-in") ||
      metadata.path.startsWith("/sign-up") ||
      metadata.path.startsWith("/my-images") ||
      metadata.path.startsWith("/catalog-intelligence") ||
      metadata.path === "/checkout" ||
      (metadata.path.startsWith("/checkout/") && metadata.title === "Secure Checkout | ARTCOVR") ||
      metadata.path === "/auth/callback" ||
      metadata.path === "/bag" ||
      metadata.path === "/shipping-and-return")
  ) {
    body = renderNoindexPage(metadata.path);
  }
  return {
    bodyHtml: body ?? renderNotFound(),
    structuredDataHtml: `<script type="application/ld+json" data-artcovr-static-structured-data="true">${serializeJsonLd(structuredDataForRoute(context))}</script>`,
  };
}
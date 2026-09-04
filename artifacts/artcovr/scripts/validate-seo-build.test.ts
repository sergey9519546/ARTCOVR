import assert from "node:assert/strict";
import { test } from "node:test";

import curatedPublic from "../src/lib/artcovr/curated-public.json" with {
  type: "json",
};
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";
import { displayGenreLabel, getArtworkGenres } from "../src/lib/artcovr/genre-index";
import { getRouteMetadata } from "../src/lib/artcovr/route-metadata";
import { validateRoute } from "./validate-seo-build";

const publicCatalog = selectPublicCatalog(curatedPublic);
const siteUrl = "https://artcovr.com";
const artwork = publicCatalog[0];
const route = `/product/${encodeURIComponent(artwork.slug)}`;
const metadata = getRouteMetadata(
  route,
  publicCatalog,
  (candidate) => getArtworkGenres(candidate).map(displayGenreLabel),
);

function renderGeneratedProductDocument() {
  assert.ok(metadata.image, "fixture metadata should include a product image");
  const canonical = new URL(route, `${siteUrl}/`).toString();
  const imageUrl = new URL(metadata.image.url, `${siteUrl}/`).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "ARTCOVR" },
      { "@type": "WebSite", name: "ARTCOVR", url: siteUrl },
      {
        "@type": "ImageObject",
        contentUrl: imageUrl,
        url: imageUrl,
        caption: artwork.alt,
        acquireLicensePage: canonical,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Archive", item: `${siteUrl}/archive` },
          { "@type": "ListItem", position: 2, name: artwork.title, item: canonical },
        ],
      },
      {
        "@type": "Product",
        name: artwork.title,
        description: artwork.description,
        sku: artwork.slug,
        url: canonical,
      },
    ],
  };

  return `<!doctype html>
<html>
  <head>
    <title>${metadata.title}</title>
    <meta name="description" content="${metadata.description}" />
    <meta property="og:title" content="${metadata.title}" />
    <meta property="og:description" content="${metadata.description}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:type" content="product" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${metadata.title}" />
    <meta name="twitter:description" content="${metadata.description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${metadata.image.alt}" />
    <link rel="canonical" href="${canonical}" />
  </head>
  <body>
    <h1>${artwork.title}</h1>
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  </body>
</html>`;
}

function validateProductDocument(html: string) {
  validateRoute(route, html, siteUrl, [
    "Organization",
    "WebSite",
    "ImageObject",
    "BreadcrumbList",
    "Product",
  ], {
    metadata,
    artwork,
  });
}

test("reports the product route and Open Graph signal when a generated tag is removed", () => {
  const generatedDocument = renderGeneratedProductDocument();
  const mutatedDocument = generatedDocument.replace(
    `<meta property="og:title" content="${metadata.title}" />`,
    "",
  );

  assert.notEqual(mutatedDocument, generatedDocument);
  assert.throws(
    () => validateProductDocument(mutatedDocument),
    /\[SEO\] \/product\/cart-of-hours: Open Graph title/,
  );
  assert.doesNotThrow(() => validateProductDocument(generatedDocument));
});

test("reports the product route and Twitter signal when a generated tag changes", () => {
  const generatedDocument = renderGeneratedProductDocument();
  const mutatedDocument = generatedDocument.replace(
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:card" content="summary" />',
  );

  assert.notEqual(mutatedDocument, generatedDocument);
  assert.throws(
    () => validateProductDocument(mutatedDocument),
    /\[SEO\] \/product\/cart-of-hours: Twitter card/,
  );
  assert.doesNotThrow(() => validateProductDocument(generatedDocument));
});
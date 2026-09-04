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

const specialCharacterArtwork = {
  ...artwork,
  slug: "special-character-fixture",
  title: `O'Brien & Sons "Live"`,
};
const specialCharacterRoute = `/product/${encodeURIComponent(specialCharacterArtwork.slug)}`;
const specialCharacterMetadata = getRouteMetadata(
  specialCharacterRoute,
  [specialCharacterArtwork],
  () => ["R&B"],
);
const catalogFixture = { route, metadata, artwork };
const specialCharacterFixture = {
  route: specialCharacterRoute,
  metadata: specialCharacterMetadata,
  artwork: specialCharacterArtwork,
};

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

function renderGeneratedProductDocument(
  fixture = catalogFixture,
  escapeText = false,
) {
  const { route: fixtureRoute, metadata: fixtureMetadata, artwork: fixtureArtwork } = fixture;
  assert.ok(fixtureMetadata.image, "fixture metadata should include a product image");
  const text = escapeText ? escapeHtml : (value: string) => value;
  const canonical = new URL(fixtureRoute, `${siteUrl}/`).toString();
  const imageUrl = new URL(fixtureMetadata.image.url, `${siteUrl}/`).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "ARTCOVR" },
      { "@type": "WebSite", name: "ARTCOVR", url: siteUrl },
      {
        "@type": "ImageObject",
        contentUrl: imageUrl,
        url: imageUrl,
        caption: fixtureArtwork.alt,
        acquireLicensePage: canonical,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Archive", item: `${siteUrl}/archive` },
          { "@type": "ListItem", position: 2, name: fixtureArtwork.title, item: canonical },
        ],
      },
      {
        "@type": "Product",
        name: fixtureArtwork.title,
        description: fixtureArtwork.description,
        sku: fixtureArtwork.slug,
        url: canonical,
      },
    ],
  };

  return `<!doctype html>
<html>
  <head>
    <title>${text(fixtureMetadata.title)}</title>
    <meta name="description" content="${text(fixtureMetadata.description)}" />
    <meta property="og:title" content="${text(fixtureMetadata.title)}" />
    <meta property="og:description" content="${text(fixtureMetadata.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:type" content="product" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${text(fixtureMetadata.title)}" />
    <meta name="twitter:description" content="${text(fixtureMetadata.description)}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta name="twitter:image:alt" content="${text(fixtureMetadata.image.alt)}" />
    <link rel="canonical" href="${canonical}" />
  </head>
  <body>
    <h1>${text(fixtureArtwork.title)}</h1>
    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
  </body>
</html>`;
}

function validateProductDocument(html: string, fixture = catalogFixture) {
  validateRoute(fixture.route, html, siteUrl, [
    "Organization",
    "WebSite",
    "ImageObject",
    "BreadcrumbList",
    "Product",
  ], {
    metadata: fixture.metadata,
    artwork: fixture.artwork,
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

test("accepts escaped special characters in isolated Open Graph and Twitter fixtures", () => {
  const generatedDocument = renderGeneratedProductDocument(
    specialCharacterFixture,
    true,
  );

  assert.match(generatedDocument, /O&#39;Brien &amp; Sons &quot;Live&quot;/);
  assert.doesNotThrow(() =>
    validateProductDocument(generatedDocument, specialCharacterFixture),
  );
});

test("reports the exact route and social signal when an escaped value decodes incorrectly", () => {
  const generatedDocument = renderGeneratedProductDocument(
    specialCharacterFixture,
    true,
  );
  const escapedTitle = escapeHtml(specialCharacterMetadata.title);
  const escapedDescription = escapeHtml(specialCharacterMetadata.description);
  const wrongOpenGraphDocument = generatedDocument.replace(
    `<meta property="og:title" content="${escapedTitle}" />`,
    `<meta property="og:title" content="${escapeHtml("Wrong & title")}" />`,
  );
  const wrongTwitterDocument = generatedDocument.replace(
    `<meta name="twitter:description" content="${escapedDescription}" />`,
    `<meta name="twitter:description" content="${escapeHtml("Wrong & description")}" />`,
  );

  assert.throws(
    () => validateProductDocument(wrongOpenGraphDocument, specialCharacterFixture),
    /\[SEO\] \/product\/special-character-fixture: Open Graph title/,
  );
  assert.throws(
    () => validateProductDocument(wrongTwitterDocument, specialCharacterFixture),
    /\[SEO\] \/product\/special-character-fixture: Twitter description/,
  );
});

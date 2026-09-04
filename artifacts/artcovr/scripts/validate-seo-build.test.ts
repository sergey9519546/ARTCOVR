import assert from "node:assert/strict";
import { test } from "node:test";

import curatedPublic from "../src/lib/artcovr/curated-public.json" with {
  type: "json",
};
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";
import { displayGenreLabel, getArtworkGenres } from "../src/lib/artcovr/genre-index";
import { getRouteMetadata } from "../src/lib/artcovr/route-metadata";
import {
  renderStaticRoute,
  renderStaticRouteMetadata,
} from "../src/lib/artcovr/static-render";
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
const catalogFixture = {
  route,
  metadata,
  artwork,
  genres: getArtworkGenres(artwork).map(displayGenreLabel),
};
const specialCharacterFixture = {
  route: specialCharacterRoute,
  metadata: specialCharacterMetadata,
  artwork: specialCharacterArtwork,
  genres: ["R&B"],
};

function renderGeneratedProductDocument(fixture = catalogFixture) {
  const { route: fixtureRoute, metadata: fixtureMetadata, artwork: fixtureArtwork } = fixture;
  assert.ok(fixtureMetadata.image, "fixture metadata should include a product image");
  const rendered = renderStaticRoute({
    artworks: [fixtureArtwork],
    siteUrl,
    metadata: fixtureMetadata,
    getGenres: () => fixture.genres,
  });

  return `<!doctype html>
<html>
  <head>
    ${renderStaticRouteMetadata(fixtureMetadata, siteUrl, false)}
  </head>
  <body>
    ${rendered.bodyHtml}
    ${rendered.structuredDataHtml}
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

test("accepts escaped special characters in static product Open Graph and Twitter metadata", () => {
  const generatedDocument = renderGeneratedProductDocument(specialCharacterFixture);

  assert.match(generatedDocument, /O&#39;Brien &amp; Sons &quot;Live&quot;/);
  assert.doesNotThrow(() =>
    validateProductDocument(generatedDocument, specialCharacterFixture),
  );
});

test("reports the exact route and social signal when an escaped value decodes incorrectly", () => {
  const generatedDocument = renderGeneratedProductDocument(specialCharacterFixture);
  const wrongOpenGraphDocument = generatedDocument.replace(
    /(<meta property="og:title" content=")[^"]*(" \/>)/,
    "$1Wrong &amp; title$2",
  );
  const wrongTwitterDocument = generatedDocument.replace(
    /(<meta name="twitter:description" content=")[^"]*(" \/>)/,
    "$1Wrong &amp; description$2",
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

import assert from "node:assert/strict";
import { test } from "node:test";

import curatedPublic from "../src/lib/artcovr/curated-public.json" with {
  type: "json",
};
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";
import { ANSWER_GUIDE_BY_PATH } from "../src/lib/artcovr/answer-guides";
import { displayGenreLabel, getArtworkGenres } from "../src/lib/artcovr/genre-index";
import {
  getIndexableRoutePaths,
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "../src/lib/artcovr/route-metadata";
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
const publicRouteFixtures = [
  ...getIndexableRoutePaths(publicCatalog).filter(
    (publicRoute) => !publicRoute.startsWith("/product/"),
  ),
].map((publicRoute) => ({
  route: publicRoute,
  metadata: getRouteMetadata(
    publicRoute,
    publicCatalog,
    (candidate) => getArtworkGenres(candidate).map(displayGenreLabel),
  ),
}));
const escapedPublicFixture = {
  route: "/about",
  metadata: {
    ...getRouteMetadata("/about", publicCatalog),
    title: `About O'Brien & Sons "Live" | ARTCOVR`,
    description:
      `ARTCOVR's "direct" cover-art process & license for artists.`,
  },
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

function renderGeneratedPublicDocument(fixture: (typeof publicRouteFixtures)[number]) {
  const rendered = renderStaticRoute({
    artworks: publicCatalog,
    siteUrl,
    metadata: fixture.metadata,
    getGenres: (candidate) =>
      getArtworkGenres(candidate).map(displayGenreLabel),
  });

  return `<!doctype html>
<html>
  <head>
    ${renderStaticRouteMetadata(fixture.metadata, siteUrl, false)}
  </head>
  <body>
    ${rendered.bodyHtml}
    ${rendered.structuredDataHtml}
  </body>
</html>`;
}

function validatePublicDocument(
  fixture: (typeof publicRouteFixtures)[number],
  generatedDocument: string,
) {
  const expectedTypes =
    fixture.route === "/faq"
      ? ["Organization", "WebSite", "FAQPage"]
      : fixture.route === "/archive"
        ? ["Organization", "WebSite", "CollectionPage", "ImageObject"]
        : ["Organization", "WebSite", "WebPage"];
  validateRoute(
    fixture.route,
    generatedDocument,
    siteUrl,
    expectedTypes,
    { metadata: fixture.metadata },
  );
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

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readMeta(html: string, attribute: "name" | "property", key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<meta ${attribute}="${escapedKey}" content="([^"]*)" \\/>`,
    ),
  );
  assert.ok(match, `expected ${attribute}=${key} metadata`);
  return decodeHtml(match[1]);
}

function readCanonical(html: string) {
  const match = html.match(/<link rel="canonical" href="([^"]*)" \/>/);
  assert.ok(match, "expected canonical metadata");
  return decodeHtml(match[1]);
}

function assertSocialPreviewParity(
  generatedDocument: string,
  fixtureMetadata: ReturnType<typeof getRouteMetadata>,
) {
  const social = getSocialPreviewMetadata(fixtureMetadata, siteUrl);
  const expected = {
    title: social.title,
    description: social.description,
    image: social.imageUrl,
    canonical: social.canonical,
  };

  assert.deepEqual(
    {
      openGraph: {
        title: readMeta(generatedDocument, "property", "og:title"),
        description: readMeta(generatedDocument, "property", "og:description"),
        image: readMeta(generatedDocument, "property", "og:image"),
        canonical: readMeta(generatedDocument, "property", "og:url"),
      },
      twitter: {
        title: readMeta(generatedDocument, "name", "twitter:title"),
        description: readMeta(generatedDocument, "name", "twitter:description"),
        image: readMeta(generatedDocument, "name", "twitter:image"),
      },
      canonical: readCanonical(generatedDocument),
    },
    {
      openGraph: expected,
      twitter: {
        title: expected.title,
        description: expected.description,
        image: expected.image,
      },
      canonical: expected.canonical,
    },
  );
}

test("keeps interactive and static social previews equivalent for catalog products", () => {
  for (const fixture of [catalogFixture, specialCharacterFixture]) {
    const generatedDocument = renderGeneratedProductDocument(fixture);
    assertSocialPreviewParity(generatedDocument, fixture.metadata);
  }
});

test("keeps interactive and static social previews equivalent for public informational routes", () => {
  for (const fixture of publicRouteFixtures) {
    const generatedDocument = renderGeneratedPublicDocument(fixture);
    assertSocialPreviewParity(generatedDocument, fixture.metadata);
    if (fixture.route !== "/") {
      validatePublicDocument(fixture, generatedDocument);
    }
    assert.equal(
      getSocialPreviewMetadata(fixture.metadata, siteUrl).imageUrl,
      `${siteUrl}/og-image.png`,
    );
  }
});

test("publishes source-backed guide content and citable structured data", () => {
  for (const [path, guide] of ANSWER_GUIDE_BY_PATH) {
    const guideMetadata = getRouteMetadata(path, publicCatalog);
    const generatedDocument = renderGeneratedPublicDocument({
      route: path,
      metadata: guideMetadata,
    });

    assert.match(generatedDocument, /Key takeaways/);
    assert.match(generatedDocument, /Sources and scope/);
    assert.match(generatedDocument, new RegExp(guide.lastReviewed));
    for (const source of guide.sources) {
      assert.match(generatedDocument, new RegExp(source.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(generatedDocument, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const structuredData = JSON.parse(
      generatedDocument.match(
        /<script type="application\/ld\+json" data-artcovr-static-structured-data="true">([\s\S]*?)<\/script>/,
      )?.[1] ?? "null",
    );
    const types = structuredData["@graph"].map((entry: { ["@type"]?: string | string[] }) =>
      Array.isArray(entry["@type"]) ? entry["@type"].join(",") : entry["@type"],
    );
    assert.ok(types.includes("Article"), `${path} should expose Article structured data`);
    assert.ok(types.includes("FAQPage"), `${path} should expose FAQPage structured data`);
    const article = structuredData["@graph"].find(
      (entry: { ["@type"]?: string }) => entry["@type"] === "Article",
    );
    assert.deepEqual(
      article.citation,
      guide.sources.map((source) => new URL(source.href, `${siteUrl}/`).toString()),
    );
  }
});

test("decodes escaped informational metadata equivalently across preview paths", () => {
  const generatedDocument = renderGeneratedPublicDocument(escapedPublicFixture);

  assert.match(generatedDocument, /O&#39;Brien &amp; Sons &quot;Live&quot;/);
  assert.match(generatedDocument, /ARTCOVR&#39;s &quot;direct&quot; cover-art process &amp; license/);
  assertSocialPreviewParity(generatedDocument, escapedPublicFixture.metadata);
});

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

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { displayArtworks } from "./artworks.ts";
import {
  getPrerenderedRoutePaths,
  getRouteMetadata,
} from "./route-metadata.ts";
import { renderStaticRoute } from "./static-render.ts";

describe("route metadata", () => {
  test("recognizes valid checkout slugs as private checkout pages", () => {
    const artwork = displayArtworks[0];
    assert.ok(artwork);

    const metadata = getRouteMetadata(`/checkout/${artwork.slug}`, displayArtworks);

    assert.equal(metadata.title, "Secure Checkout | ARTCOVR");
    assert.match(metadata.description, new RegExp(artwork.title));
    assert.equal(metadata.index, false);
    assert.equal(metadata.path, `/checkout/${artwork.slug}`);
    assert.deepEqual(metadata.image, { url: artwork.image, alt: artwork.alt });
  });

  test("keeps invalid checkout slugs intentionally not found", () => {
    const metadata = getRouteMetadata("/checkout/not-a-real-cover", displayArtworks);

    assert.equal(metadata.title, "Page Not Found | ARTCOVR");
    assert.equal(metadata.index, false);
    assert.equal(metadata.path, "/checkout/not-a-real-cover");

    const rendered = renderStaticRoute({
      artworks: displayArtworks,
      siteUrl: "https://artcovr.com",
      metadata,
      getGenres: (artwork) => [artwork.category],
    });
    assert.match(rendered.bodyHtml, /Page not found\./);
  });

  test("prerenders valid checkout routes without making them indexable", () => {
    const artwork = displayArtworks[0];
    assert.ok(artwork);
    const paths = getPrerenderedRoutePaths(displayArtworks);
    const checkoutPath = `/checkout/${encodeURIComponent(artwork.slug)}`;

    assert.ok(paths.includes(checkoutPath));
    assert.equal(getRouteMetadata(checkoutPath, displayArtworks).index, false);
  });
});
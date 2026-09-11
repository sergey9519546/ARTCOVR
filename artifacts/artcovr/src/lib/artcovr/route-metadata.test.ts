import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { displayArtworks } from "./artworks.ts";
import {
  getIndexableRoutePaths,
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
    assert.deepEqual(metadata.image, {
      url: artwork.image,
      alt: artwork.alt,
      width: 1200,
      height: 1200,
      type: "image/jpeg",
    });
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

  test("derives indexable routes while excluding private prerendered routes", () => {
    const artwork = displayArtworks[0];
    assert.ok(artwork);
    const indexablePaths = getIndexableRoutePaths(displayArtworks);

    assert.ok(indexablePaths.includes("/"));
    assert.ok(indexablePaths.includes("/archive"));
    assert.ok(
      indexablePaths.includes(`/product/${encodeURIComponent(artwork.slug)}`),
    );
    assert.equal(indexablePaths.includes("/sign-in"), false);
    assert.equal(
      indexablePaths.includes(`/checkout/${encodeURIComponent(artwork.slug)}`),
      false,
    );
  });

  test("keeps genre breadcrumbs synchronized in HTML and structured data", () => {
    const path = "/cover-art/ambient";
    const rendered = renderStaticRoute({
      artworks: displayArtworks,
      siteUrl: "https://artcovr.com",
      metadata: getRouteMetadata(path, displayArtworks),
      getGenres: (artwork) => [artwork.category, "ambient"],
    });
    const jsonLd = JSON.parse(
      rendered.structuredDataHtml
        .replace(/^<script[^>]*>/, "")
        .replace(/<\/script>$/, ""),
    );
    const breadcrumb = jsonLd["@graph"].find(
      (entity: { "@type"?: string }) => entity["@type"] === "BreadcrumbList",
    );

    assert.match(
      rendered.bodyHtml,
      /<nav aria-label="Breadcrumb"><a href="\/cover-art"[^>]*>Music cover art by genre<\/a>.*<span>Ambient<\/span><\/nav>/,
    );
    assert.deepEqual(breadcrumb, {
      "@type": "BreadcrumbList",
      "@id": "https://artcovr.com/cover-art/ambient#breadcrumb",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Music cover art by genre",
          item: "https://artcovr.com/cover-art",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Ambient",
          item: "https://artcovr.com/cover-art/ambient",
        },
      ],
    });
  });

  test("serves responsive WebP artwork in static collection routes", () => {
    const artwork = displayArtworks[0];
    assert.ok(artwork);
    const optimizedName = artwork.image
      .slice("/assets/artworks/".length, -".jpg".length);
    const routes = ["/", "/archive", "/cover-art/ambient"];

    for (const path of routes) {
      const rendered = renderStaticRoute({
        artworks: [artwork],
        siteUrl: "https://artcovr.com",
        metadata: getRouteMetadata(path, [artwork]),
        getGenres: () => ["ambient"],
      });

      assert.match(
        rendered.bodyHtml,
        new RegExp(
          `<picture>\\s*<source srcset="/assets/artworks/optimized/${optimizedName}-640\\.webp 640w, /assets/artworks/optimized/${optimizedName}\\.webp 1280w"[^>]*type="image/webp"`,
        ),
      );
      assert.match(
        rendered.bodyHtml,
        new RegExp(
          `<img src="${artwork.image}" alt="${artwork.alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" width="1200" height="1200" sizes="[^"]+" loading="lazy" decoding="async"`,
        ),
      );
      assert.doesNotMatch(rendered.bodyHtml, /fetchpriority="high"/i);
    }
  });
});
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  absoluteSiteUrl,
  buildArtworkStructuredData,
  createPageMetadata,
  getSiteUrl,
  isSearchIndexingDisabled,
  serializeJsonLd,
} from "../../src/lib/artcovr/seo.ts";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("site URL normalization rejects non-web protocols and discards path state", () => {
  assert.equal(getSiteUrl("javascript:alert(1)"), "https://artcovr.com");
  assert.equal(getSiteUrl("https://example.com/stale?x=1#y"), "https://example.com");
  assert.equal(getSiteUrl("https://user:secret@example.com"), "https://example.com");
  assert.equal(
    absoluteSiteUrl("/legal/privacy", "https://example.com"),
    "https://example.com/legal/privacy",
  );
  assert.equal(
    absoluteSiteUrl("javascript:alert(1)", "https://example.com"),
    "https://example.com/",
  );
});

test("private staging and explicit launch controls disable indexing", () => {
  assert.equal(isSearchIndexingDisabled({}), false);
  assert.equal(isSearchIndexingDisabled({ ARTCOVR_ALLOW_INDEXING: "0" }), true);
  assert.equal(
    isSearchIndexingDisabled({ NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING: "1" }),
    true,
  );
});

test("public page metadata uses an absolute self-canonical", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const previousStaging = process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING;
  const previousIndexing = process.env.ARTCOVR_ALLOW_INDEXING;
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  delete process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING;
  delete process.env.ARTCOVR_ALLOW_INDEXING;
  try {
    const metadata = createPageMetadata({
      title: "About",
      description: "About ARTCOVR.",
      path: "/about",
    });
    assert.equal(metadata.alternates?.canonical, "https://example.com/about");
    assert.deepEqual(metadata.robots, { index: true, follow: true });
  } finally {
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    if (previousStaging === undefined) delete process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING;
    else process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING = previousStaging;
    if (previousIndexing === undefined) delete process.env.ARTCOVR_ALLOW_INDEXING;
    else process.env.ARTCOVR_ALLOW_INDEXING = previousIndexing;
  }
});

test("JSON-LD serialization cannot be terminated by catalog text", () => {
  const malicious = "</script><script>alert('x')</script>&\u2028";
  const serialized = serializeJsonLd({ malicious });
  assert.doesNotMatch(serialized, /<\/script|<script|&/i);
  assert.deepEqual(JSON.parse(serialized), { malicious });
  assert.equal(serializeJsonLd(undefined), "null");
});

test("Product and Offer schema are emitted only for purchasable art", () => {
  const base = {
    slug: "sample",
    title: "Sample",
    description: "A square cover artwork.",
    image: "/sample.jpg",
    alt: "Abstract square artwork",
    category: "Abstract",
    priceCents: 12550,
    rightsApproved: true,
    published: true,
    saleMode: "exclusive" as const,
  };
  const graph = buildArtworkStructuredData(base, "https://example.com")["@graph"];
  const product = graph.find((entry) => entry["@type"] === "Product");
  assert.ok(product && "offers" in product);
  assert.equal(product.offers.price, "125.50");
  assert.equal(product.offers.priceCurrency, "USD");

  const unpublished = buildArtworkStructuredData(
    { ...base, published: false },
    "https://example.com",
  )["@graph"];
  assert.equal(unpublished.some((entry) => entry["@type"] === "Product"), false);
});

test("Next configuration enforces baseline browser security headers", async () => {
  const config = await read("next.config.ts");
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /Content-Security-Policy/);
  assert.match(config, /frame-ancestors 'none'/);
  assert.match(config, /X-Content-Type-Options[\s\S]*nosniff/);
  assert.match(config, /Referrer-Policy[\s\S]*strict-origin-when-cross-origin/);
  assert.match(config, /X-Frame-Options[\s\S]*DENY/);
});

test("private account and checkout routes declare noindex metadata", async () => {
  const privateLayouts = await Promise.all([
    read("src/app/sign-in/layout.tsx"),
    read("src/app/my-images/layout.tsx"),
    read("src/app/checkout/[slug]/layout.tsx"),
  ]);
  for (const source of privateLayouts) {
    assert.match(source, /index:\s*false/);
    assert.match(source, /follow:\s*false/);
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildSitemapXml,
} from "./discovery.ts";

const items = [
  {
    slug: "blue-hour",
    title: "Blue Hour",
    description: "A blue-toned study in quiet geometric light.",
    category: "Abstract",
    image: "/assets/artworks/blue-hour.jpg",
    alt: "Blue geometric cover artwork",
    moodTags: ["quiet", "nocturnal"],
    saleMode: "repeatable" as const,
    priceCents: 2400,
  },
];

test("discovery files expose canonical public routes and catalog facts", () => {
  const sitemap = buildSitemapXml(items, "https://example.com/");
  assert.match(sitemap, /https:\/\/example\.com\/archive/);
  assert.match(sitemap, /https:\/\/example\.com\/product\/blue-hour/);
  assert.match(sitemap, /xmlns:image=/);
  assert.match(sitemap, /<image:loc>https:\/\/example\.com\/assets\/artworks\/blue-hour\.jpg/);
  assert.match(sitemap, /<image:caption>Blue geometric cover artwork/);
  assert.match(sitemap, /<image:license>https:\/\/example\.com\/license/);
  assert.doesNotMatch(sitemap, /sign-in|checkout|my-images/);

  const llms = buildLlmsTxt(items, "https://example.com/");
  assert.match(llms, /ARTCOVR is a curated storefront/);
  assert.match(llms, /\[Blue Hour\]\(https:\/\/example\.com\/product\/blue-hour\)/);

  const full = buildLlmsFullTxt(items, "https://example.com/");
  assert.match(full, /exclusive commercial license|repeatable non-exclusive commercial license/);
  assert.match(full, /\$24\.00 USD/);
  assert.match(full, /Image URL: https:\/\/example\.com\/assets\/artworks\/blue-hour\.jpg/);
});
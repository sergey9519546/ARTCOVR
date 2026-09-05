import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCatalogFactsJson,
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

test("catalog facts distinguish exclusive, repeatable, and unknown sale states", () => {
  const facts = JSON.parse(buildCatalogFactsJson([
    {
      ...items[0],
      slug: "exclusive-work",
      saleMode: "exclusive",
      priceCents: 9900,
    },
    items[0],
    {
      ...items[0],
      slug: "terms-pending",
      saleMode: null,
      priceCents: null,
    },
  ], "https://example.com/"));

  assert.equal(facts.version, "artcovr-catalog-facts/v1");
  assert.deepEqual(facts.organization, {
    name: "ARTCOVR",
    url: "https://example.com",
    roles: ["publisher", "licensor"],
  });
  assert.deepEqual(
    facts.items.map((item: { saleMode: string; availability: string }) => ({
      saleMode: item.saleMode,
      availability: item.availability,
    })),
    [
      { saleMode: "exclusive", availability: "available" },
      { saleMode: "repeatable", availability: "available" },
      { saleMode: "unknown", availability: "unknown" },
    ],
  );
  assert.deepEqual(facts.items[0].price, { amount: 99, currency: "USD" });
  assert.equal(facts.items[2].price, null);
  assert.equal(facts.items[0].publisher.name, "ARTCOVR");
  assert.equal(facts.items[0].licensor.url, "https://example.com");
  assert.equal(facts.items[0].licenseUrl, "https://example.com/license");
  assert.equal(facts.items[0].imageUrl, "https://example.com/assets/artworks/blue-hour.jpg");
  assert.equal(facts.items[0].aiGeneration.disclosed, true);
  assert.equal("creator" in facts.items[0], false);
});

test("catalog facts remain valid JSON for public text", () => {
  const unsafe = {
    ...items[0],
    title: `A "quoted" title \u2028 </script>`,
    description: "Line one\nLine two\t& <tag>",
    moodTags: ["calm", `quoted "mood"`],
  };
  const json = buildCatalogFactsJson([unsafe], "https://example.com/");
  const facts = JSON.parse(json);

  assert.equal(facts.items[0].title, unsafe.title);
  assert.equal(facts.items[0].description, unsafe.description);
  assert.equal(facts.items[0].moods[1], unsafe.moodTags[1]);

  const full = buildLlmsFullTxt([{ ...unsafe, saleMode: null }], "https://example.com/");
  assert.match(full, /license terms pending; unknown/);
  assert.doesNotMatch(full, /repeatable non-exclusive commercial license/);
});
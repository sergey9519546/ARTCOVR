import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAgentCatalogJson,
  buildCatalogFactsJson,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildSitemapXml,
} from "./discovery.ts";

const items = [
  {
    id: "artwork-blue-hour",
    slug: "blue-hour",
    title: "Blue Hour",
    description: "A blue-toned study in quiet geometric light.",
    category: "Abstract",
    image: "/assets/artworks/blue-hour.jpg",
    alt: "Blue geometric cover artwork",
    moodTags: ["quiet", "nocturnal"],
    saleMode: "repeatable" as const,
    priceCents: 2400,
    rightsApproved: true,
    published: true,
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
  assert.match(full, /Machine-purchase catalog: https:\/\/example\.com\/agent-catalog\.json/);
});

test("agent catalog exposes only sale-eligible works and protected delivery links", () => {
  const feed = JSON.parse(buildAgentCatalogJson([
    items[0],
    { ...items[0], id: "unpublished", slug: "unpublished", published: false },
    { ...items[0], id: "unpriced", slug: "unpriced", priceCents: null },
    { ...items[0], id: "unlicensed", slug: "unlicensed", rightsApproved: false },
    { ...items[0], id: "pending-sale", slug: "pending-sale", saleMode: null },
  ], "https://example.com/"));

  assert.equal(feed.version, "artcovr-agent-catalog/v2");
  assert.deepEqual(feed.payment, {
    protocol: "mpp",
    supportedRails: ["stripe_shared_payment_tokens"],
    minimum: { amountCents: 50, amount: 0.5, currency: "USD" },
    settlement: "stripe",
    challengeStatus: 402,
  });
  assert.equal(feed.items.length, 1);
  assert.deepEqual(feed.items[0], {
    id: "artwork-blue-hour",
    slug: "blue-hour",
    title: "Blue Hour",
    description: "A blue-toned study in quiet geometric light.",
    canonicalUrl: "https://example.com/product/blue-hour",
    previewUrl: "https://example.com/assets/artworks/blue-hour.jpg",
    deliveryUrl: "https://example.com/api/agent/artworks/blue-hour/image",
    price: { amountCents: 2400, amount: 24, currency: "USD" },
    availability: "available",
    saleMode: "repeatable",
    license: {
      name: "repeatable non-exclusive commercial license",
      url: "https://example.com/license",
      scope: "commercial",
    },
  });
  assert.doesNotMatch(JSON.stringify(feed), /storage|objectKey|orderId|paymentId|payer/i);
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

  assert.equal(facts.version, "artcovr-catalog-facts/v2");
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
      { saleMode: "exclusive", availability: "live_check_required" },
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

// Inventory changes independently after a build. The public projection carries
// no authoritative inventory data, so it must produce the same honest static
// claim for each of these possible live states (including initially available).
for (const inventoryState of ["available", "reserved", "sold"] as const) {
  test(`static exclusive feeds require a live check when inventory is ${inventoryState}`, () => {
    const fixture = {
      inventory: { state: inventoryState },
      publicArtwork: {
        ...items[0],
        saleMode: "exclusive" as const,
        priceCents: 9900,
      },
    };
    const catalog = [fixture.publicArtwork];
    const facts = JSON.parse(buildCatalogFactsJson(catalog, "https://example.com"));
    const agent = JSON.parse(buildAgentCatalogJson(catalog, "https://example.com"));

    for (const feed of [facts, agent]) {
      assert.equal(feed.items.length, 1);
      assert.equal(feed.items[0].saleMode, "exclusive");
      assert.equal(feed.items[0].availability, "live_check_required");
      assert.equal(feed.items[0].price.amount, 99);
      assert.equal(feed.items[0].price.currency, "USD");
      assert.equal(feed.availabilityPolicy.source, "static_catalog");
      assert.match(feed.availabilityPolicy.exclusive, /available, reserved, or sold/);
      assert.match(feed.availabilityPolicy.exclusive, /verify through checkout/i);
      assert.equal("inventory" in feed.items[0], false);
    }
    assert.equal(facts.items[0].license, "exclusive commercial license");
    assert.equal(agent.items[0].license.name, "exclusive commercial license");
    assert.equal(agent.items[0].price.amountCents, 9900);
    assert.equal(agent.items[0].deliveryUrl, "https://example.com/api/agent/artworks/blue-hour/image");

    const full = buildLlmsFullTxt(catalog, "https://example.com");
    assert.match(full, /- Availability: live_check_required/);
    assert.match(full, /- Agent purchase availability: live_check_required/);
    assert.doesNotMatch(full, /- (?:Agent purchase availability|Availability): available\b/);
  });
}

test("AI discovery explains static inventory limits without claiming immediate purchase", () => {
  for (const text of [
    buildLlmsTxt(items, "https://example.com"),
    buildLlmsFullTxt(items, "https://example.com"),
  ]) {
    assert.match(text, /static discovery (?:feed|catalog), not live inventory/);
    assert.match(text, /live_check_required/);
    assert.match(text, /available, reserved, or sold/);
    assert.match(text, /409 artwork_unavailable/);
    assert.doesNotMatch(text, /purchasable now/);
  }
  const pending = buildLlmsFullTxt([
    { ...items[0], saleMode: "exclusive", priceCents: null },
  ], "https://example.com");
  assert.match(pending, /- Agent purchase availability: unavailable/);
  assert.match(pending, /- Agent delivery URL: not listed until price and sale mode are approved/);
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
  assert.match(full, /Sale mode: unknown/);
  assert.match(full, /License: license terms pending/);
  assert.doesNotMatch(full, /repeatable non-exclusive commercial license/);
});
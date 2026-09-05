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

const readBytes = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url));

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

test("FAQ answers are emitted as matching FAQPage structured data", async () => {
  const faq = await read("src/app/faq/page.tsx");
  assert.match(faq, /"@type": "FAQPage"/);
  assert.match(faq, /mainEntity: questions\.map/);
  assert.match(faq, /"@type": "Question"/);
  assert.match(faq, /"@type": "Answer"/);
  assert.match(faq, /serializeJsonLd\(faqStructuredData\)/);
});

test("product pages publish transactional metadata and licensable image attribution", async () => {
  const product = await read("src/app/product/[slug]/page.tsx");
  assert.match(product, /title: `\$\{art\.title\} Cover Art License`/);
  assert.match(product, /description: getProductMetadataDescription\(art\)/);
  assert.match(product, /license: absoluteSiteUrl\("\/license"\)/);
  assert.match(product, /acquireLicensePage: productUrl/);
  assert.match(product, /creditText: "ARTCOVR"/);
});

test("product sitemap entries include their public catalog image", async () => {
  const sitemap = await read("src/app/sitemap.ts");
  assert.match(
    sitemap,
    /images: \[absoluteSiteUrl\(artwork\.image, siteUrl\)\]/,
  );
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

// The Next.js `headers()` hook never executes under `output: "export"`, so
// asserting against next.config.ts only proves that a dead code path is
// well-formed. vercel.json is the file the CDN actually reads, so the security
// contract has to be enforced there.
type DeployHeader = { key: string; value: string };
type DeployHeaderRule = { source: string; headers: DeployHeader[] };
type DeployConfig = { headers: DeployHeaderRule[] };

const headerValue = (rule: DeployHeaderRule, key: string): string | undefined =>
  rule.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())
    ?.value;

const findRule = (
  config: DeployConfig,
  source: string,
): DeployHeaderRule | undefined =>
  config.headers.find((rule) => rule.source === source);

test("the deployed Vercel config enforces baseline browser security headers", async () => {
  const config = JSON.parse(await read("vercel.json")) as DeployConfig;

  const globalRule = findRule(config, "/(.*)");
  assert.ok(globalRule, "vercel.json must declare a global /(.*) header rule");

  const csp = headerValue(globalRule, "Content-Security-Policy");
  assert.ok(csp, "the deployed config must ship a Content-Security-Policy");
  for (const directive of [
    "script-src 'self' 'unsafe-inline'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]) {
    assert.ok(csp.includes(directive), `CSP is missing "${directive}"`);
  }

  assert.equal(
    headerValue(globalRule, "Referrer-Policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(headerValue(globalRule, "X-Content-Type-Options"), "nosniff");
  assert.equal(headerValue(globalRule, "X-Frame-Options"), "DENY");
});

test("the Next dev CSP permits the App Router hydration bootstrap", async () => {
  const source = await read("next.config.ts");
  assert.match(
    source,
    /script-src 'self' 'unsafe-inline'/,
    "Next App Router inline bootstrap scripts must execute until build-time CSP hashes are implemented",
  );
});

test("the deployed Vercel config keeps every private route uncacheable and unindexed", async () => {
  const config = JSON.parse(await read("vercel.json")) as DeployConfig;

  // /auth/(.*) is the Supabase OAuth callback; /api/(.*) is reserved for any
  // future non-static handler. Both must stay off the CDN and out of the index.
  for (const source of [
    "/checkout/(.*)",
    "/my-images",
    "/sign-in",
    "/auth/(.*)",
    "/api/(.*)",
  ]) {
    const rule = findRule(config, source);
    assert.ok(rule, `vercel.json must declare private headers for ${source}`);

    const cacheControl = headerValue(rule, "Cache-Control") ?? "";
    assert.match(cacheControl, /\bprivate\b/, `${source} must be private`);
    assert.match(cacheControl, /\bno-store\b/, `${source} must not be stored`);
    assert.match(
      headerValue(rule, "X-Robots-Tag") ?? "",
      /\bnoindex\b/,
      `${source} must be noindex`,
    );
  }
});

test("the root and exported Vercel configs cannot drift apart", async () => {
  const [rootConfig, exportedConfig] = await Promise.all([
    readBytes("vercel.json"),
    readBytes("public/vercel.json"),
  ]);
  assert.ok(
    rootConfig.equals(exportedConfig),
    "./vercel.json and ./public/vercel.json must stay byte-identical",
  );
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

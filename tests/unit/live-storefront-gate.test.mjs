import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLiveStorefront,
  extractHtmlMetadata,
  resolveLiveSiteUrl,
} from "../../scripts/agent/check-live-storefront.mjs";

const catalogContract = {
  expectedProductSlugs: ["sample-work"],
  forbiddenProductSlugs: [],
};

const secureHeaders = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

function publicHtml({ title, description, canonical }) {
  return `<!doctype html><html><head>
    <title>${title}</title>
    <meta content="${description}" name="description">
    <meta name='robots' content='index, follow'>
    <link href="${canonical}" rel="canonical">
  </head><body><main><h1>${title}</h1></main></body></html>`;
}

function healthySnapshots() {
  const productUrl = "https://artcovr.com/product/sample-work";
  return {
    home: {
      status: 200,
      url: "https://artcovr.com/",
      headers: { ...secureHeaders, server: "test-cdn" },
      body: publicHtml({
        title: "ARTCOVR | Curated Cover Art",
        description: "License curated cover art.",
        canonical: "https://artcovr.com/",
      }),
    },
    archive: {
      status: 200,
      url: "https://artcovr.com/archive",
      headers: secureHeaders,
      body: publicHtml({
        title: "Cover Art Archive | ARTCOVR",
        description: "Browse curated cover art.",
        canonical: "https://artcovr.com/archive",
      }),
    },
    sitemap: {
      status: 200,
      headers: { "content-type": "application/xml" },
      body: `<urlset><url><loc>https://artcovr.com/</loc></url><url><loc>${productUrl}</loc></url></urlset>`,
    },
    robots: {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "User-agent: *\nAllow: /\nSitemap: https://artcovr.com/sitemap.xml\n",
    },
    favicon: {
      status: 200,
      headers: { "content-type": "image/x-icon" },
      bodyPrefix: "\u0000\u0000\u0001\u0000",
      bodyPrefixHex: "00000100",
    },
    privatePage: {
      status: 200,
      headers: {
        ...secureHeaders,
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
      body: publicHtml({
        title: "My Images | ARTCOVR",
        description: "Manage purchases and generated images.",
        canonical: "https://artcovr.com/my-images",
      }),
    },
    notFound: {
      status: 404,
      headers: { "content-type": "text/html" },
      body: `<!doctype html><html><head><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>Not found</h1></body></html>`,
    },
    product: {
      status: 200,
      url: productUrl,
      headers: secureHeaders,
      body: publicHtml({
        title: "Sample Work | ARTCOVR",
        description: "License Sample Work.",
        canonical: productUrl,
      }),
    },
  };
}

test("metadata extraction is independent of attribute order and quote style", () => {
  const metadata = extractHtmlMetadata(publicHtml({
    title: "Sample",
    description: "A useful description.",
    canonical: "https://artcovr.com/archive/",
  }));
  assert.deepEqual(metadata, {
    title: "Sample",
    description: "A useful description.",
    robots: "index, follow",
    canonical: "https://artcovr.com/archive/",
    hasH1: true,
  });
});

test("the live gate accepts server-rendered, secure, crawlable storefront responses", () => {
  const result = evaluateLiveStorefront("https://artcovr.com", healthySnapshots(), catalogContract);
  assert.equal(result.failed, 0, JSON.stringify(result.failures));
  assert.ok(result.passed > 20);
  assert.equal(result.observations.sitemapUrls, 2);
});

test("the live gate rejects a hydrated-only 404 shell and HTML favicon", () => {
  const snapshots = healthySnapshots();
  const shell = `<!doctype html><html><head>
    <title>Page Not Found | ARTCOVR</title>
    <meta name="description" content="The requested page could not be found.">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <link rel="canonical" href="https://artcovr.com/404">
  </head><body>Loading app</body></html>`;
  snapshots.home = {
    status: 200,
    url: "https://artcovr.com/",
    headers: { "content-type": "text/html", server: "test-cdn" },
    body: shell,
  };
  snapshots.archive = { ...snapshots.home, url: "https://artcovr.com/archive/" };
  snapshots.product = { ...snapshots.home, url: "https://artcovr.com/product/sample-work/" };
  snapshots.favicon = {
    status: 200,
    headers: { "content-type": "text/html" },
    bodyPrefix: "<!doctype html><html>",
    bodyPrefixHex: "3c21646f63747970652068746d6c3e",
  };
  snapshots.privatePage = {
    status: 200,
    headers: { "cache-control": "private" },
    body: shell,
  };
  snapshots.notFound = {
    status: 200,
    headers: { "content-type": "text/html" },
    body: shell,
  };

  const result = evaluateLiveStorefront("https://artcovr.com", snapshots, catalogContract);
  const failedIds = new Set(result.failures.map((failure) => failure.id));
  for (const id of [
    "home.title",
    "archive.indexable",
    "product.canonical",
    "headers.home.csp-default-src",
    "headers.archive.csp-frame-ancestors",
    "headers.product.permissions-policy",
    "headers.private.cross-origin-resource-policy",
    "favicon.image-content-type",
    "favicon.not-html",
    "favicon.signature",
    "private.content",
    "private.cache",
    "private.noindex",
    "not-found.status",
  ]) {
    assert.ok(failedIds.has(id), `expected ${id} to fail`);
  }
});

test("the live gate rejects a site-wide robots block, a private 404, and fake image bytes", () => {
  const snapshots = healthySnapshots();
  snapshots.robots.body = "User-agent: *\nDisallow: /\nSitemap: https://artcovr.com/sitemap.xml\n";
  snapshots.privatePage.status = 404;
  snapshots.privatePage.body = `<!doctype html><html><head><title>Page Not Found | ARTCOVR</title></head><body></body></html>`;
  snapshots.favicon = {
    status: 200,
    headers: { "content-type": "image/png" },
    bodyPrefix: "not an image",
    bodyPrefixHex: "6e6f7420616e20696d616765",
  };

  const failedIds = new Set(
    evaluateLiveStorefront("https://artcovr.com", snapshots, catalogContract).failures.map(({ id }) => id),
  );
  for (const id of ["robots.indexable", "private.reachable", "private.content", "favicon.signature"]) {
    assert.ok(failedIds.has(id), `expected ${id} to fail`);
  }
});

test("the live gate rejects an off-origin robots sitemap and an HTML-shaped private route", () => {
  const snapshots = healthySnapshots();
  snapshots.robots.body = "User-agent: *\nAllow: /\nSitemap: https://example.invalid/sitemap.xml\n";
  snapshots.privatePage.headers["content-type"] = "application/json";
  snapshots.privatePage.body = "{}";

  const failedIds = new Set(
    evaluateLiveStorefront("https://artcovr.com", snapshots, catalogContract).failures.map(({ id }) => id),
  );
  for (const id of ["robots.sitemap-canonical", "private.html-content-type", "private.content"]) {
    assert.ok(failedIds.has(id), `expected ${id} to fail`);
  }
});

test("the live target argument wins over ambient staging configuration", () => {
  assert.equal(
    resolveLiveSiteUrl(
      ["node", "check-live-storefront.mjs", "--url=https://artcovr.com"],
      { ARTCOVR_LIVE_SITE_URL: "http://127.0.0.1:3000" },
    ),
    "https://artcovr.com",
  );
});

test("the live gate rejects stale, missing, and withdrawn catalog routes", () => {
  const snapshots = healthySnapshots();
  snapshots.sitemap.body = `<urlset>
    <url><loc>https://artcovr.com/</loc></url>
    <url><loc>https://artcovr.com/product/stale-work</loc></url>
  </urlset>`;
  snapshots.forbiddenProducts = [{
    slug: "withdrawn-work",
    snapshot: {
      status: 200,
      headers: { "content-type": "text/html" },
      body: publicHtml({
        title: "Withdrawn Work",
        description: "Still exposed.",
        canonical: "https://artcovr.com/product/withdrawn-work",
      }),
    },
  }];

  const result = evaluateLiveStorefront("https://artcovr.com", snapshots, {
    expectedProductSlugs: ["sample-work"],
    forbiddenProductSlugs: ["withdrawn-work"],
  });
  const failedIds = new Set(result.failures.map(({ id }) => id));
  for (const id of [
    "catalog.expected-products",
    "catalog.no-extra-products",
    "catalog.forbidden-products",
  ]) {
    assert.ok(failedIds.has(id), `expected ${id} to fail`);
  }
});

test("the live gate does not discard malformed product URLs from the exact-set check", () => {
  const snapshots = healthySnapshots();
  snapshots.sitemap.body = snapshots.sitemap.body.replace(
    "</urlset>",
    "<url><loc>https://artcovr.com/product/unapproved_slug</loc></url></urlset>",
  );
  const result = evaluateLiveStorefront("https://artcovr.com", snapshots, catalogContract);
  assert.ok(result.failures.some(({ id }) => id === "catalog.valid-product-urls"));
});

test("the live gate rejects security headers that merely look nonempty", () => {
  const snapshots = healthySnapshots();
  for (const page of ["home", "archive", "product", "privatePage"]) {
    snapshots[page].headers = {
      ...snapshots[page].headers,
      "strict-transport-security": "max-age=0",
      "referrer-policy": "unsafe-url",
      "permissions-policy": "camera=*",
    };
  }
  const failedIds = new Set(
    evaluateLiveStorefront("https://artcovr.com", snapshots, catalogContract).failures.map(({ id }) => id),
  );
  for (const page of ["home", "archive", "product", "private"]) {
    for (const headerName of ["strict-transport-security", "referrer-policy", "permissions-policy"]) {
      assert.ok(failedIds.has(`headers.${page}.${headerName}`));
    }
  }
});

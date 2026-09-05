/**
 * Read-only production audit for the surfaces a healthy static storefront must
 * expose before it can acquire traffic or safely accept customers.
 *
 * Local release gates prove the repository. This gate proves the deployed URL:
 * server-rendered SEO, sitemap coherence, private-route headers, favicon bytes,
 * and the baseline browser-security headers. It deliberately evaluates the raw
 * HTTP response rather than hydrated DOM; crawlers and link unfurlers must not
 * receive a 404 shell that JavaScript repairs later.
 *
 *   node scripts/agent/check-live-storefront.mjs
 *   node scripts/agent/check-live-storefront.mjs --url=https://artcovr.com
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SITE_URL = "https://artcovr.com";
const REQUEST_TIMEOUT_MS = 15_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function resolveLiveSiteUrl(argv = process.argv, env = process.env) {
  const urlArg = argv.find((value) => value.startsWith("--url="));
  return urlArg?.slice("--url=".length) || env.ARTCOVR_LIVE_SITE_URL || DEFAULT_SITE_URL;
}

function cleanText(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function attributes(tag) {
  const found = {};
  for (const match of tag.matchAll(
    /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  )) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return found;
}

export function extractHtmlMetadata(html) {
  const title = cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  let description = "";
  let robots = "";
  let canonical = "";

  for (const match of html.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const name = attrs.name?.toLowerCase();
    if (name === "description") description = attrs.content ?? "";
    if (name === "robots") robots = attrs.content ?? "";
    if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) {
      canonical = attrs.href ?? "";
    }
  }

  return {
    title,
    description: cleanText(description),
    robots: robots.toLowerCase(),
    canonical,
    hasH1: /<h1\b/i.test(html),
  };
}

function normalizeComparableUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.href;
  } catch {
    return "";
  }
}

function parseSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) =>
    match[1].replaceAll("&amp;", "&").trim(),
  );
}

function header(snapshot, name) {
  return snapshot?.headers?.[name.toLowerCase()] ?? "";
}

function hasFaviconSignature(contentType, prefixHex, prefixText) {
  if (contentType.includes("svg")) {
    return /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefixText);
  }
  if (contentType.includes("png")) return /^89504e470d0a1a0a/i.test(prefixHex);
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return /^ffd8ff/i.test(prefixHex);
  if (contentType.includes("webp")) return /^52494646[0-9a-f]{8}57454250/i.test(prefixHex);
  if (contentType.includes("icon") || contentType.includes("ico")) return /^00000100/i.test(prefixHex);
  return false;
}

function isErrorMetadata(metadata) {
  const combined = `${metadata.title} ${metadata.description}`;
  return /\b(?:404|page not found|requested page could not be found)\b/i.test(combined);
}

export function evaluateLiveStorefront(
  siteUrl,
  snapshots,
  { expectedProductSlugs = [], forbiddenProductSlugs = [] } = {},
) {
  const checks = [];
  const check = (id, passed, detail) => checks.push({ id, passed: Boolean(passed), detail });
  const base = new URL(siteUrl);

  const assertPublicPage = (name, snapshot, expectedUrl) => {
    check(`${name}.reachable`, snapshot?.status === 200, `HTTP ${snapshot?.status ?? "unavailable"}`);
    check(
      `${name}.html-content-type`,
      header(snapshot, "content-type").toLowerCase().includes("text/html"),
      header(snapshot, "content-type") || "missing Content-Type",
    );
    const metadata = extractHtmlMetadata(snapshot?.body ?? "");
    check(`${name}.title`, Boolean(metadata.title) && !isErrorMetadata(metadata), metadata.title || "missing title");
    check(
      `${name}.description`,
      Boolean(metadata.description) && !isErrorMetadata(metadata),
      metadata.description || "missing description",
    );
    check(
      `${name}.indexable`,
      Boolean(metadata.robots) && !/\b(?:noindex|nofollow)\b/.test(metadata.robots),
      metadata.robots || "missing robots metadata",
    );
    check(
      `${name}.canonical`,
      normalizeComparableUrl(metadata.canonical) === normalizeComparableUrl(expectedUrl),
      metadata.canonical || "missing canonical",
    );
    check(`${name}.h1`, metadata.hasH1, metadata.hasH1 ? "H1 present" : "missing H1 in server HTML");
    return metadata;
  };

  const homeMetadata = assertPublicPage("home", snapshots.home, base.href);
  const archiveMetadata = assertPublicPage("archive", snapshots.archive, new URL("/archive", base).href);

  const baselineHeaders = [
    ["csp-default-src", "content-security-policy", /(?:^|;)\s*default-src\s+'self'/i],
    ["csp-frame-ancestors", "content-security-policy", /(?:^|;)\s*frame-ancestors\s+'none'/i],
    ["csp-object-src", "content-security-policy", /(?:^|;)\s*object-src\s+'none'/i],
    ["csp-base-uri", "content-security-policy", /(?:^|;)\s*base-uri\s+'self'/i],
    ["x-frame-options", "x-frame-options", /^DENY$/i],
    ["x-content-type-options", "x-content-type-options", /^nosniff$/i],
    ["strict-transport-security", "strict-transport-security", (value) => {
      const maxAge = /(?:^|;)\s*max-age=(\d+)(?:;|$)/i.exec(value)?.[1];
      return maxAge !== undefined && Number(maxAge) >= 31_536_000;
    }],
    ["referrer-policy", "referrer-policy", (value) => value.trim().toLowerCase() === "strict-origin-when-cross-origin"],
    ["cross-origin-opener-policy", "cross-origin-opener-policy", /^same-origin$/i],
    ["cross-origin-resource-policy", "cross-origin-resource-policy", /^same-origin$/i],
    ["permissions-policy", "permissions-policy", (value) =>
      ["camera", "microphone", "geolocation", "browsing-topics"].every((feature) =>
        new RegExp(`(?:^|,)\\s*${feature}=\\(\\)\\s*(?:,|$)`, "i").test(value),
      )],
  ];
  const assertBaselineHeaders = (pageName, snapshot) => {
    for (const [id, name, expected] of baselineHeaders) {
      const value = header(snapshot, name);
      const passed = expected instanceof RegExp ? expected.test(value) : expected(value);
      check(`headers.${pageName}.${id}`, passed, value || "missing");
    }
  };
  assertBaselineHeaders("home", snapshots.home);
  assertBaselineHeaders("archive", snapshots.archive);

  const sitemapUrls = parseSitemapUrls(snapshots.sitemap?.body ?? "");
  const uniqueSitemapUrls = new Set(sitemapUrls);
  const productUrl = sitemapUrls.find((value) => {
    try {
      const parsed = new URL(value);
      return parsed.origin === base.origin && /^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(parsed.pathname);
    } catch {
      return false;
    }
  });
  check("sitemap.reachable", snapshots.sitemap?.status === 200, `HTTP ${snapshots.sitemap?.status ?? "unavailable"}`);
  check(
    "sitemap.content-type",
    header(snapshots.sitemap, "content-type").toLowerCase().includes("xml"),
    header(snapshots.sitemap, "content-type") || "missing Content-Type",
  );
  check("sitemap.urls", sitemapUrls.length > 1, `${sitemapUrls.length} URLs`);
  check("sitemap.unique", uniqueSitemapUrls.size === sitemapUrls.length, `${uniqueSitemapUrls.size}/${sitemapUrls.length} unique`);
  const sameOriginUrls = sitemapUrls.filter((value) => {
    try {
      return new URL(value).origin === base.origin;
    } catch {
      return false;
    }
  });
  check("sitemap.same-origin", sameOriginUrls.length === sitemapUrls.length, `${sameOriginUrls.length}/${sitemapUrls.length} same-origin`);
  check("sitemap.product", Boolean(productUrl), productUrl ?? "no same-origin product URL");

  const productPaths = sameOriginUrls.filter((value) => new URL(value).pathname.startsWith("/product/"));
  const invalidProductUrls = productPaths.filter((value) =>
    !/^\/product\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(new URL(value).pathname),
  );
  const actualProductSlugs = productPaths.flatMap((value) => {
    const match = /^\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(new URL(value).pathname);
    return match ? [match[1]] : [];
  });
  const expectedProducts = new Set(expectedProductSlugs);
  const actualProducts = new Set(actualProductSlugs);
  const missingProducts = [...expectedProducts].filter((slug) => !actualProducts.has(slug)).sort();
  const extraProducts = [...actualProducts].filter((slug) => !expectedProducts.has(slug)).sort();
  check(
    "catalog.valid-product-urls",
    invalidProductUrls.length === 0,
    invalidProductUrls.length > 0
      ? `${invalidProductUrls.length} invalid product URLs: ${invalidProductUrls.slice(0, 8).join(", ")}`
      : "all product URLs use canonical slugs",
  );
  check(
    "catalog.expected-products",
    expectedProducts.size > 0 && missingProducts.length === 0,
    missingProducts.length > 0
      ? `${missingProducts.length} missing: ${missingProducts.slice(0, 8).join(", ")}`
      : `${actualProducts.size}/${expectedProducts.size} expected products`,
  );
  check(
    "catalog.no-extra-products",
    expectedProducts.size > 0 && extraProducts.length === 0,
    extraProducts.length > 0
      ? `${extraProducts.length} extra: ${extraProducts.slice(0, 8).join(", ")}`
      : "no unapproved or stale sitemap products",
  );

  const forbiddenSnapshots = new Map(
    (snapshots.forbiddenProducts ?? []).map(({ slug, snapshot }) => [slug, snapshot]),
  );
  const exposedForbidden = forbiddenProductSlugs.filter((slug) => {
    const snapshot = forbiddenSnapshots.get(slug);
    const metadata = extractHtmlMetadata(snapshot?.body ?? "");
    const noindex = /\bnoindex\b/.test(metadata.robots) ||
      header(snapshot, "x-robots-tag").toLowerCase().includes("noindex");
    return snapshot?.status !== 404 || !noindex;
  });
  check(
    "catalog.forbidden-products",
    forbiddenSnapshots.size === forbiddenProductSlugs.length && exposedForbidden.length === 0,
    exposedForbidden.length > 0
      ? `${exposedForbidden.length} withdrawn routes exposed: ${exposedForbidden.slice(0, 8).join(", ")}`
      : `${forbiddenSnapshots.size}/${forbiddenProductSlugs.length} withdrawn routes return indexed-safe 404s`,
  );

  let productMetadata = null;
  if (productUrl && snapshots.product) {
    productMetadata = assertPublicPage("product", snapshots.product, productUrl);
    assertBaselineHeaders("product", snapshots.product);
  } else {
    check("product.audited", false, "no product page could be sampled from sitemap.xml");
  }

  const robotsBody = snapshots.robots?.body ?? "";
  check("robots.reachable", snapshots.robots?.status === 200, `HTTP ${snapshots.robots?.status ?? "unavailable"}`);
  check("robots.user-agent", /(?:^|\n)\s*user-agent\s*:/i.test(robotsBody), "User-agent directive");
  check(
    "robots.indexable",
    !/(?:^|\n)\s*disallow\s*:\s*\/(?:\*\s*)?(?:#.*)?$/im.test(robotsBody),
    "no site-wide Disallow rule",
  );
  const robotsSitemaps = [...robotsBody.matchAll(/(?:^|\n)\s*sitemap\s*:\s*(https?:\/\/\S+)/gi)]
    .map((match) => match[1].trim());
  const expectedSitemap = normalizeComparableUrl(new URL("/sitemap.xml", base).href);
  const canonicalRobotsSitemap = robotsSitemaps.length > 0 && robotsSitemaps.every((value) => {
    try {
      return new URL(value).origin === base.origin;
    } catch {
      return false;
    }
  }) && robotsSitemaps.some((value) => normalizeComparableUrl(value) === expectedSitemap);
  check("robots.sitemap", robotsSitemaps.length > 0, robotsSitemaps.join(", ") || "missing Sitemap directive");
  check(
    "robots.sitemap-canonical",
    canonicalRobotsSitemap,
    robotsSitemaps.join(", ") || "missing same-origin canonical sitemap",
  );

  const faviconType = header(snapshots.favicon, "content-type").toLowerCase();
  const faviconPrefix = snapshots.favicon?.bodyPrefix ?? "";
  const faviconPrefixHex = snapshots.favicon?.bodyPrefixHex ?? "";
  check("favicon.reachable", snapshots.favicon?.status === 200, `HTTP ${snapshots.favicon?.status ?? "unavailable"}`);
  check("favicon.image-content-type", faviconType.startsWith("image/"), faviconType || "missing Content-Type");
  check("favicon.not-html", !/^\s*(?:<!doctype|<html)/i.test(faviconPrefix), faviconPrefix.slice(0, 30) || "empty body");
  check(
    "favicon.signature",
    hasFaviconSignature(faviconType, faviconPrefixHex, faviconPrefix),
    faviconPrefixHex.slice(0, 32) || "empty body",
  );

  const privateCache = header(snapshots.privatePage, "cache-control").toLowerCase();
  const privateRobots = header(snapshots.privatePage, "x-robots-tag").toLowerCase();
  const privateMetadata = extractHtmlMetadata(snapshots.privatePage?.body ?? "");
  check("private.reachable", snapshots.privatePage?.status === 200, `HTTP ${snapshots.privatePage?.status ?? "unavailable"}`);
  check(
    "private.html-content-type",
    header(snapshots.privatePage, "content-type").toLowerCase().includes("text/html"),
    header(snapshots.privatePage, "content-type") || "missing Content-Type",
  );
  check(
    "private.content",
    Boolean(privateMetadata.title) && privateMetadata.hasH1 && !isErrorMetadata(privateMetadata),
    privateMetadata.title || "missing title",
  );
  assertBaselineHeaders("private", snapshots.privatePage);
  check("private.cache", privateCache.includes("no-store"), privateCache || "missing Cache-Control");
  check("private.noindex", privateRobots.includes("noindex"), privateRobots || "missing X-Robots-Tag");

  const notFoundMetadata = extractHtmlMetadata(snapshots.notFound?.body ?? "");
  check("not-found.status", snapshots.notFound?.status === 404, `HTTP ${snapshots.notFound?.status ?? "unavailable"}`);
  check(
    "not-found.noindex",
    /\bnoindex\b/.test(notFoundMetadata.robots) || header(snapshots.notFound, "x-robots-tag").toLowerCase().includes("noindex"),
    notFoundMetadata.robots || header(snapshots.notFound, "x-robots-tag") || "missing noindex",
  );

  const failures = checks.filter((entry) => !entry.passed);
  return {
    gate: "live-storefront",
    target: base.origin,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    observations: {
      server: header(snapshots.home, "server") || null,
      homeFinalUrl: snapshots.home?.url ?? null,
      homeTitle: homeMetadata.title || null,
      archiveFinalUrl: snapshots.archive?.url ?? null,
      archiveTitle: archiveMetadata.title || null,
      sitemapUrls: sitemapUrls.length,
      expectedProducts: expectedProducts.size,
      liveProducts: actualProducts.size,
      missingProducts: missingProducts.length,
      extraProducts: extraProducts.length,
      forbiddenProductsChecked: forbiddenSnapshots.size,
      forbiddenProductsExposed: exposedForbidden.length,
      sampledProduct: productUrl ?? null,
      productFinalUrl: snapshots.product?.url ?? null,
      productTitle: productMetadata?.title ?? null,
    },
  };
}

async function loadCatalogContract() {
  const [publicText, approvedText] = await Promise.all([
    readFile(path.join(projectRoot, "src", "lib", "artcovr", "curated-public.json"), "utf8"),
    readFile(path.join(projectRoot, "catalog", "approved-artworks.json"), "utf8"),
  ]);
  const publicRows = JSON.parse(publicText);
  const approvedRows = JSON.parse(approvedText);
  if (!Array.isArray(publicRows) || !Array.isArray(approvedRows)) {
    throw new Error("catalog projections are not arrays");
  }
  const expectedProductSlugs = publicRows.map((row) => row?.slug);
  const allApprovedSlugs = approvedRows.map((row) => row?.slug);
  const validSlug = (slug) => typeof slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  if (
    expectedProductSlugs.length === 0 ||
    expectedProductSlugs.some((slug) => !validSlug(slug)) ||
    allApprovedSlugs.some((slug) => !validSlug(slug)) ||
    new Set(expectedProductSlugs).size !== expectedProductSlugs.length
  ) {
    throw new Error("catalog projection contains missing, invalid, or duplicate slugs");
  }
  const expected = new Set(expectedProductSlugs);
  return {
    expectedProductSlugs,
    forbiddenProductSlugs: [...new Set(allApprovedSlugs.filter((slug) => !expected.has(slug)))].sort(),
  };
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function requestSnapshot(fetchImpl, url, { binary = false } = {}) {
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const headers = Object.fromEntries(
      [...response.headers.entries()].map(([name, value]) => [name.toLowerCase(), value]),
    );
    if (binary) {
      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        status: response.status,
        url: response.url || url,
        redirected: response.redirected,
        headers,
        bodyPrefix: bytes.subarray(0, 64).toString("utf8"),
        bodyPrefixHex: bytes.subarray(0, 64).toString("hex"),
      };
    }
    return {
      status: response.status,
      url: response.url || url,
      redirected: response.redirected,
      headers,
      body: await response.text(),
    };
  } catch (error) {
    return {
      status: 0,
      url,
      headers: {},
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function auditLiveStorefront({ siteUrl = DEFAULT_SITE_URL, fetchImpl = fetch } = {}) {
  const parsed = new URL(siteUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("live storefront URL must use HTTP or HTTPS");
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";

  const catalogContract = await loadCatalogContract();
  const [home, archive, sitemap, robots, favicon, privatePage, notFound] = await Promise.all([
    requestSnapshot(fetchImpl, parsed.href),
    requestSnapshot(fetchImpl, new URL("/archive", parsed).href),
    requestSnapshot(fetchImpl, new URL("/sitemap.xml", parsed).href),
    requestSnapshot(fetchImpl, new URL("/robots.txt", parsed).href),
    requestSnapshot(fetchImpl, new URL("/favicon.ico", parsed).href, { binary: true }),
    requestSnapshot(fetchImpl, new URL("/my-images", parsed).href),
    requestSnapshot(fetchImpl, new URL("/__artcovr_live_gate_missing__", parsed).href),
  ]);
  const productUrl = parseSitemapUrls(sitemap.body ?? "").find((value) => {
    try {
      const candidate = new URL(value);
      return candidate.origin === parsed.origin && /^\/product\/[^/]+\/?$/.test(candidate.pathname);
    } catch {
      return false;
    }
  });
  const product = productUrl ? await requestSnapshot(fetchImpl, productUrl) : null;
  const forbiddenProducts = await mapWithConcurrency(
    catalogContract.forbiddenProductSlugs,
    6,
    async (slug) => ({
      slug,
      snapshot: await requestSnapshot(fetchImpl, new URL(`/product/${slug}`, parsed).href),
    }),
  );

  return evaluateLiveStorefront(parsed.href, {
    home,
    archive,
    sitemap,
    robots,
    favicon,
    privatePage,
    notFound,
    product,
    forbiddenProducts,
  }, catalogContract);
}

async function main() {
  const siteUrl = resolveLiveSiteUrl();
  try {
    const result = await auditLiveStorefront({ siteUrl });
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      gate: "live-storefront",
      target: siteUrl,
      passed: 0,
      failed: 1,
      failures: [{
        id: "audit.runtime",
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      }],
    }, null, 2));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();

import { readFile } from "node:fs/promises";
import path from "node:path";

import curatedPublic from "../src/lib/artcovr/curated-public.json" with { type: "json" };
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";

const outputDirectory = path.resolve(import.meta.dirname, "../dist/public");
const publicCatalog = selectPublicCatalog(curatedPublic);
const siteRoutes = [
  "/",
  "/archive",
  "/about",
  "/faq",
  "/license",
  "/refunds",
  "/contact",
  "/legal/privacy",
  "/legal/terms",
] as const;
const titleRange = { min: 20, max: 60 };
const descriptionRange = { min: 70, max: 160 };

function seoFailure(route: string, signal: string, detail?: string): never {
  throw new Error(`[SEO] ${route}: ${signal}${detail ? ` (${detail})` : ""}`);
}

function check(
  condition: unknown,
  route: string,
  signal: string,
  detail?: string,
): asserts condition {
  if (!condition) seoFailure(route, signal, detail);
}

function collectTags(html: string, tagName: string) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "gi"))].map(
    (match) => match[0],
  );
}

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function canonicalUrlFor(route: string, siteUrl: string) {
  return new URL(route, `${siteUrl}/`).toString();
}

function routeFile(route: string) {
  if (route === "/") return path.join(outputDirectory, "index.html");
  return path.join(
    outputDirectory,
    route.replace(/^\/+|\/+$/g, ""),
    "index.html",
  );
}

async function readRoute(route: string) {
  try {
    return await readFile(routeFile(route), "utf8");
  } catch {
    seoFailure(
      route,
      "generated HTML file",
      "file is missing from dist/public",
    );
  }
}

function validateStructuredData(
  route: string,
  html: string,
  expectedTypes: string[],
) {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ].map((match) => match[1].trim());
  check(
    scripts.length === 1,
    route,
    "JSON-LD block",
    `expected one block, found ${scripts.length}`,
  );

  let structuredData: unknown;
  try {
    structuredData = JSON.parse(scripts[0]);
  } catch {
    seoFailure(route, "JSON-LD", "structured data is not valid JSON");
  }

  const graph =
    structuredData && typeof structuredData === "object"
      ? (structuredData as { "@graph"?: unknown })["@graph"]
      : undefined;
  const entities = Array.isArray(graph)
    ? graph
    : structuredData
      ? [structuredData]
      : [];
  const types = new Set(
    entities.flatMap((entity) => {
      if (!entity || typeof entity !== "object") return [];
      const type = (entity as { "@type"?: unknown })["@type"];
      return Array.isArray(type)
        ? type
        : typeof type === "string"
          ? [type]
          : [];
    }),
  );

  for (const expectedType of expectedTypes) {
    check(
      types.has(expectedType),
      route,
      `JSON-LD ${expectedType} entity`,
      `found ${[...types].sort().join(", ") || "no entity types"}`,
    );
  }
}

function validateRoute(
  route: string,
  html: string,
  siteUrl: string,
  expectedTypes: string[],
) {
  const titleTags = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
  check(
    titleTags.length === 1,
    route,
    "title",
    `expected one title, found ${titleTags.length}`,
  );
  const title = decodeHtml(titleTags[0][1].trim());
  check(
    title.length >= titleRange.min && title.length <= titleRange.max,
    route,
    "title length",
    `${title.length} characters; expected ${titleRange.min}-${titleRange.max}`,
  );

  const descriptionTags = collectTags(html, "meta").filter(
    (tag) => attribute(tag, "name")?.toLowerCase() === "description",
  );
  check(
    descriptionTags.length === 1,
    route,
    "meta description",
    `expected one description, found ${descriptionTags.length}`,
  );
  const description = decodeHtml(
    attribute(descriptionTags[0], "content") ?? "",
  );
  check(
    description.length >= descriptionRange.min &&
      description.length <= descriptionRange.max,
    route,
    "meta description length",
    `${description.length} characters; expected ${descriptionRange.min}-${descriptionRange.max}`,
  );

  const canonicalTags = collectTags(html, "link").filter((tag) =>
    attribute(tag, "rel")
      ?.split(/\s+/)
      .some((rel) => rel.toLowerCase() === "canonical"),
  );
  check(
    canonicalTags.length === 1,
    route,
    "canonical URL",
    `expected one canonical link, found ${canonicalTags.length}`,
  );
  check(
    attribute(canonicalTags[0], "href") === canonicalUrlFor(route, siteUrl),
    route,
    "canonical URL",
    `expected ${canonicalUrlFor(route, siteUrl)}`,
  );

  const contentWithoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const headings = [
    ...contentWithoutScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi),
  ]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  check(headings.length > 0, route, "crawler-visible H1");
  if (route === "/") {
    const noscript =
      /<noscript\b[\s\S]*?<h1\b[^>]*>[\s\S]*?<\/h1>[\s\S]*?<\/noscript>/i;
    check(noscript.test(html), route, "no-JavaScript H1 fallback");
  }

  validateStructuredData(route, html, expectedTypes);
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function expectedSitemapUrls(siteUrl: string) {
  return new Set([
    ...siteRoutes.map((route) => canonicalUrlFor(route, siteUrl)),
    ...publicCatalog.map((artwork) =>
      canonicalUrlFor(`/product/${encodeURIComponent(artwork.slug)}`, siteUrl),
    ),
  ]);
}

async function validateDiscoveryFiles(siteUrl: string) {
  const robotsRoute = "robots.txt";
  let robots: string;
  try {
    robots = await readFile(path.join(outputDirectory, robotsRoute), "utf8");
  } catch {
    seoFailure(
      robotsRoute,
      "discovery file",
      "file is missing from dist/public",
    );
  }
  check(
    !/<(?:!doctype|html|head|body)\b/i.test(robots),
    robotsRoute,
    "plain-text format",
  );
  check(
    /^User-agent:\s*\*/m.test(robots),
    robotsRoute,
    "default crawler policy",
  );
  check(
    robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`),
    robotsRoute,
    "canonical sitemap URL",
  );

  const sitemapRoute = "sitemap.xml";
  let sitemap: string;
  try {
    sitemap = await readFile(path.join(outputDirectory, sitemapRoute), "utf8");
  } catch {
    seoFailure(
      sitemapRoute,
      "discovery file",
      "file is missing from dist/public",
    );
  }
  check(
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset\b[\s\S]*<\/urlset>\s*$/i.test(
      sitemap,
    ),
    sitemapRoute,
    "XML format",
  );

  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map(
    (match) => match[1],
  );
  const locations = entries.flatMap((entry) =>
    [...entry.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
      decodeXml(match[1]),
    ),
  );
  check(
    entries.length === locations.length,
    sitemapRoute,
    "URL location",
    "every URL entry must contain exactly one <loc>",
  );

  const expected = expectedSitemapUrls(siteUrl);
  check(
    locations.length === expected.size,
    sitemapRoute,
    "approved catalog URL count",
    `expected ${expected.size}, found ${locations.length}`,
  );
  const unexpected = locations.filter((location) => !expected.has(location));
  check(
    unexpected.length === 0,
    sitemapRoute,
    "approved catalog URLs",
    unexpected.slice(0, 3).join(", "),
  );
  check(
    new Set(locations).size === locations.length,
    sitemapRoute,
    "duplicate catalog URLs",
  );

  const imageLocations = [
    ...sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/gi),
  ].map((match) => decodeXml(match[1]));
  const approvedImages = new Set(
    publicCatalog.map((artwork) => canonicalUrlFor(artwork.image, siteUrl)),
  );
  check(
    imageLocations.length === approvedImages.size,
    sitemapRoute,
    "catalog image URL count",
    `expected ${approvedImages.size}, found ${imageLocations.length}`,
  );
  check(
    imageLocations.every((location) => approvedImages.has(location)),
    sitemapRoute,
    "approved catalog image URLs",
  );
}

async function main() {
  check(
    publicCatalog.length === 187,
    "catalog",
    "approved catalog count",
    `${publicCatalog.length} items`,
  );

  const homepage = await readRoute("/");
  const homepageCanonical = collectTags(homepage, "link").find((tag) =>
    attribute(tag, "rel")
      ?.split(/\s+/)
      .some((rel) => rel.toLowerCase() === "canonical"),
  );
  check(
    homepageCanonical,
    "/",
    "canonical URL",
    "homepage canonical link is missing",
  );
  let siteUrl: string;
  try {
    const canonical = new URL(attribute(homepageCanonical, "href") ?? "");
    siteUrl = canonical.origin;
  } catch {
    seoFailure(
      "/",
      "canonical URL",
      "homepage canonical link is not an absolute URL",
    );
  }

  validateRoute("/", homepage, siteUrl, [
    "Organization",
    "WebSite",
    "CollectionPage",
    "ImageObject",
  ]);
  validateRoute("/archive", await readRoute("/archive"), siteUrl, [
    "Organization",
    "WebSite",
    "CollectionPage",
    "ImageObject",
  ]);

  const productRoute = `/product/${encodeURIComponent(publicCatalog[0].slug)}`;
  validateRoute(productRoute, await readRoute(productRoute), siteUrl, [
    "Organization",
    "WebSite",
    "ImageObject",
    "BreadcrumbList",
    "Product",
  ]);
  await validateDiscoveryFiles(siteUrl);

  console.log(
    `[SEO] validated /, /archive, ${productRoute}, robots.txt, sitemap.xml (${publicCatalog.length} catalog images)`,
  );
}

await main();
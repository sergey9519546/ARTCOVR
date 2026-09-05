import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import curatedPublic from "../src/lib/artcovr/curated-public.json" with { type: "json" };
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";
import { displayGenreLabel, getArtworkGenres } from "../src/lib/artcovr/genre-index";
import {
  getIndexableRoutePaths,
  getPrerenderedRoutePaths,
  getRouteMetadata,
  getSocialPreviewMetadata,
} from "../src/lib/artcovr/route-metadata";
import {
  buildCatalogFactsJson,
  buildLlmsFullTxt,
  buildLlmsTxt,
} from "../src/lib/artcovr/discovery";

const outputDirectory = path.resolve(import.meta.dirname, "../dist/public");
const publicCatalog = selectPublicCatalog(curatedPublic);
const titleRange = { min: 20, max: 60 };
const descriptionRange = { min: 70, max: 160 };
const maxReportedFailures = 20;

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

function validateMetaTag(
  route: string,
  html: string,
  attributeName: string,
  attributeValue: string,
  expected: string,
  signal: string,
) {
  const tags = collectTags(html, "meta").filter(
    (tag) =>
      attribute(tag, attributeName)?.toLowerCase() ===
      attributeValue.toLowerCase(),
  );
  check(
    tags.length === 1,
    route,
    signal,
    `expected one meta ${attributeName}="${attributeValue}", found ${tags.length}`,
  );
  const actual = decodeHtml(attribute(tags[0], "content") ?? "");
  check(actual === expected, route, signal, `expected "${expected}"`);
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

function failureMessage(error: unknown, route: string) {
  if (error instanceof Error && error.message) return error.message;
  return `[SEO] ${route}: validation failed (${String(error)})`;
}

async function collectFailure(
  failures: string[],
  route: string,
  validate: () => void | Promise<void>,
) {
  try {
    await validate();
  } catch (error) {
    failures.push(failureMessage(error, route));
  }
}

function reportFailures(failures: string[]) {
  if (failures.length === 0) return false;

  console.error(`[SEO] validation failed with ${failures.length} issue(s):`);
  for (const failure of failures.slice(0, maxReportedFailures)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > maxReportedFailures) {
    console.error(
      `- ... ${failures.length - maxReportedFailures} additional issue(s) omitted`,
    );
  }
  process.exitCode = 1;
  return true;
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

  return entities.filter(
    (entity): entity is Record<string, unknown> =>
      Boolean(entity) && typeof entity === "object" && !Array.isArray(entity),
  );
}

export function validateRoute(
  route: string,
  html: string,
  siteUrl: string,
  expectedTypes: string[],
  routeExpectation?: {
    metadata: ReturnType<typeof getRouteMetadata>;
    artwork?: (typeof publicCatalog)[number];
  },
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
  if (routeExpectation) {
    check(
      title === routeExpectation.metadata.title,
      route,
      routeExpectation.artwork ? "product title" : "route title",
      `expected "${routeExpectation.metadata.title}"`,
    );
  }

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
  if (routeExpectation) {
    check(
      description === routeExpectation.metadata.description,
      route,
      routeExpectation.artwork ? "product description" : "route description",
      `expected "${routeExpectation.metadata.description}"`,
    );
    const robotsTags = collectTags(html, "meta").filter(
      (tag) => attribute(tag, "name")?.toLowerCase() === "robots",
    );
    check(
      robotsTags.length === 1,
      route,
      "robots directive",
      `expected one robots tag, found ${robotsTags.length}`,
    );
    const robots = (attribute(robotsTags[0], "content") ?? "").toLowerCase();
    check(
      routeExpectation.metadata.index
        ? robots.includes("index") && !robots.includes("noindex")
        : robots.includes("noindex"),
      route,
      "robots directive",
      routeExpectation.metadata.index ? "expected index" : "expected noindex",
    );
  }

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
    decodeHtml(attribute(canonicalTags[0], "href") ?? "") ===
      canonicalUrlFor(route, siteUrl),
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
    .map((match) =>
      decodeHtml(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()),
    )
    .filter(Boolean);
  check(
    routeExpectation?.artwork ? headings.length === 1 : headings.length > 0,
    route,
    "crawler-visible H1",
    routeExpectation?.artwork
      ? `expected one H1, found ${headings.length}`
      : undefined,
  );
  if (routeExpectation?.artwork) {
    check(
      headings[0] === routeExpectation.artwork.title,
      route,
      "crawler-visible H1 content",
      `expected "${routeExpectation.artwork.title}"`,
    );
  }
  if (route === "/") {
    const noscript =
      /<noscript\b[\s\S]*?<h1\b[^>]*>[\s\S]*?<\/h1>[\s\S]*?<\/noscript>/i;
    check(noscript.test(html), route, "no-JavaScript H1 fallback");
  }

  const entities = validateStructuredData(route, html, expectedTypes);
  if (routeExpectation) {
    const social = getSocialPreviewMetadata(routeExpectation.metadata, siteUrl);
    validateMetaTag(
      route,
      html,
      "property",
      "og:title",
      social.title,
      "Open Graph title",
    );
    validateMetaTag(
      route,
      html,
      "property",
      "og:description",
      social.description,
      "Open Graph description",
    );
    validateMetaTag(
      route,
      html,
      "property",
      "og:url",
      social.canonical,
      "Open Graph URL",
    );
    validateMetaTag(
      route,
      html,
      "property",
      "og:image",
      social.imageUrl,
      "Open Graph image",
    );
    validateMetaTag(
      route,
      html,
      "property",
      "og:type",
      social.openGraphType,
      "Open Graph type",
    );
    validateMetaTag(
      route,
      html,
      "name",
      "twitter:card",
      "summary_large_image",
      "Twitter card",
    );
    validateMetaTag(
      route,
      html,
      "name",
      "twitter:title",
      social.title,
      "Twitter title",
    );
    validateMetaTag(
      route,
      html,
      "name",
      "twitter:description",
      social.description,
      "Twitter description",
    );
    validateMetaTag(
      route,
      html,
      "name",
      "twitter:image",
      social.imageUrl,
      "Twitter image",
    );
    validateMetaTag(
      route,
      html,
      "name",
      "twitter:image:alt",
      social.imageAlt,
      "Twitter image alt",
    );
  }
  if (routeExpectation?.artwork) {
    const canonical = canonicalUrlFor(route, siteUrl);
    const metadataImage = routeExpectation.metadata.image;
    check(metadataImage, route, "route metadata image", "image is missing");
    const imageUrl = canonicalUrlFor(metadataImage.url, siteUrl);
    const product = entities.find((entity) => entity["@type"] === "Product");
    check(product, route, "Product JSON-LD entity");
    check(
      product.name === routeExpectation.artwork.title,
      route,
      "Product JSON-LD name",
      `expected "${routeExpectation.artwork.title}"`,
    );
    check(
      product.description === routeExpectation.artwork.description,
      route,
      "Product JSON-LD description",
      `expected "${routeExpectation.artwork.description}"`,
    );
    check(product.sku === routeExpectation.artwork.slug, route, "Product JSON-LD SKU");
    check(product.url === canonical, route, "Product JSON-LD URL", `expected ${canonical}`);

    const image = entities.find((entity) => entity["@type"] === "ImageObject");
    check(image, route, "ImageObject JSON-LD entity");
    check(image.contentUrl === imageUrl, route, "ImageObject content URL", `expected ${imageUrl}`);
    check(image.url === imageUrl, route, "ImageObject URL", `expected ${imageUrl}`);
    check(
      image.caption === routeExpectation.artwork.alt,
      route,
      "ImageObject caption",
      `expected "${routeExpectation.artwork.alt}"`,
    );
    check(
      image.acquireLicensePage === canonical,
      route,
      "ImageObject acquisition URL",
      `expected ${canonical}`,
    );

    const breadcrumb = entities.find(
      (entity) => entity["@type"] === "BreadcrumbList",
    );
    check(breadcrumb, route, "BreadcrumbList JSON-LD entity");
    const breadcrumbItems = breadcrumb.itemListElement;
    check(
      Array.isArray(breadcrumbItems) && breadcrumbItems.length === 2,
      route,
      "BreadcrumbList items",
      "expected archive and product items",
    );
    const lastBreadcrumb = Array.isArray(breadcrumbItems)
      ? breadcrumbItems[1]
      : undefined;
    check(
      lastBreadcrumb &&
        typeof lastBreadcrumb === "object" &&
        lastBreadcrumb.name === routeExpectation.artwork.title &&
        lastBreadcrumb.item === canonical,
      route,
      "BreadcrumbList product item",
      `expected "${routeExpectation.artwork.title}" at ${canonical}`,
    );
  }
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
  const indexableRoutes = getIndexableRoutePaths(publicCatalog);
  return new Set([
    ...indexableRoutes.map((route) => canonicalUrlFor(route, siteUrl)),
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

  const discoveryCatalog = publicCatalog.map((item) => ({
    ...item,
    genres: getArtworkGenres(item).map(displayGenreLabel),
  }));
  const expectedTextFiles = {
    "llms.txt": buildLlmsTxt(discoveryCatalog, siteUrl),
    "llms-full.txt": buildLlmsFullTxt(discoveryCatalog, siteUrl),
  };
  for (const [fileName, expectedContents] of Object.entries(expectedTextFiles)) {
    let contents: string;
    try {
      contents = await readFile(path.join(outputDirectory, fileName), "utf8");
    } catch {
      seoFailure(fileName, "discovery file", "file is missing from dist/public");
    }
    check(
      contents === expectedContents,
      fileName,
      "public catalog parity",
      "generated content does not match the approved public catalog",
    );
    check(
      !/\/(?:checkout|sign-in|sign-up|my-images|catalog-intelligence)(?:\/|\\b)/.test(contents),
      fileName,
      "private route isolation",
    );
  }

  const factsFile = "catalog-facts.json";
  let factsSource: string;
  try {
    factsSource = await readFile(path.join(outputDirectory, factsFile), "utf8");
  } catch {
    seoFailure(factsFile, "discovery file", "file is missing from dist/public");
  }
  const expectedFacts = buildCatalogFactsJson(discoveryCatalog, siteUrl);
  check(
    factsSource === expectedFacts,
    factsFile,
    "public catalog parity",
    "generated facts do not match the approved public catalog",
  );
  let facts: {
    version?: unknown;
    items?: unknown;
  };
  try {
    facts = JSON.parse(factsSource);
  } catch {
    seoFailure(factsFile, "JSON format", "file is not valid JSON");
  }
  check(
    facts.version === "artcovr-catalog-facts/v1",
    factsFile,
    "schema version",
  );
  check(
    Array.isArray(facts.items) && facts.items.length === publicCatalog.length,
    factsFile,
    "approved catalog item count",
    `expected ${publicCatalog.length}`,
  );
}

function internalAnchorPaths(html: string, siteUrl: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .flatMap((href) => {
      let url: URL;
      try {
        url = new URL(href, `${siteUrl}/`);
      } catch {
        return [];
      }
      return url.origin === siteUrl ? [url.pathname] : [];
    });
}

function validateInternalLinks(
  siteUrl: string,
  htmlByRoute: ReadonlyMap<string, string>,
) {
  const prerendered = new Set(getPrerenderedRoutePaths(publicCatalog));
  const indexable = new Set(getIndexableRoutePaths(publicCatalog));
  const graph = new Map<string, Set<string>>();

  for (const [route, html] of htmlByRoute) {
    const targets = internalAnchorPaths(html, siteUrl);
    graph.set(route, new Set(targets.filter((target) => indexable.has(target))));
    const broken = targets.filter((target) => !prerendered.has(target));
    check(
      broken.length === 0,
      route,
      "internal link target",
      broken.slice(0, 3).join(", "),
    );
  }

  const reachable = new Set<string>();
  const queue = ["/"];
  while (queue.length) {
    const route = queue.shift()!;
    if (reachable.has(route)) continue;
    reachable.add(route);
    for (const target of graph.get(route) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }
  const orphaned = [...indexable].filter((route) => !reachable.has(route));
  check(
    orphaned.length === 0,
    "internal links",
    "orphaned public routes",
    orphaned.slice(0, 5).join(", "),
  );
}

async function main() {
  const failures: string[] = [];
  const indexableRoutes = getIndexableRoutePaths(publicCatalog);
  await collectFailure(failures, "catalog", () =>
    check(
      publicCatalog.length === 187,
      "catalog",
      "approved catalog count",
      `${publicCatalog.length} items`,
    ),
  );

  let homepage: string;
  try {
    homepage = await readRoute("/");
  } catch (error) {
    failures.push(failureMessage(error, "/"));
    reportFailures(failures);
    return;
  }
  const homepageCanonical = collectTags(homepage, "link").find((tag) =>
    attribute(tag, "rel")
      ?.split(/\s+/)
      .some((rel) => rel.toLowerCase() === "canonical"),
  );
  await collectFailure(failures, "/", () =>
    check(
      homepageCanonical,
      "/",
      "canonical URL",
      "homepage canonical link is missing",
    ),
  );
  if (!homepageCanonical) {
    reportFailures(failures);
    return;
  }
  let siteUrl: string;
  try {
    const canonical = new URL(attribute(homepageCanonical, "href") ?? "");
    siteUrl = canonical.origin;
  } catch {
    failures.push(
      `[SEO] /: canonical URL (homepage canonical link is not an absolute URL)`,
    );
    reportFailures(failures);
    return;
  }

  let informationalRoutesValidated = 0;
  let productRoutesValidated = 0;
  const htmlByRoute = new Map<string, string>();
  for (const publicRoute of indexableRoutes) {
    await collectFailure(failures, publicRoute, async () => {
      const metadata = getRouteMetadata(
        publicRoute,
        publicCatalog,
        (candidate) => getArtworkGenres(candidate).map(displayGenreLabel),
      );
      const expectedTypes = publicRoute === "/"
        ? ["Organization", "WebSite", "CollectionPage", "ImageObject"]
        : publicRoute === "/archive"
          ? ["Organization", "WebSite", "CollectionPage", "ImageObject"]
          : publicRoute === "/faq"
            ? ["Organization", "WebSite", "FAQPage"]
            : publicRoute.startsWith("/product/")
              ? ["Organization", "WebSite", "ImageObject", "BreadcrumbList", "Product"]
              : ["Organization", "WebSite", "WebPage"];
      const artwork = publicRoute.startsWith("/product/")
        ? publicCatalog.find(
            (candidate) =>
              candidate.slug ===
              decodeURIComponent(publicRoute.slice("/product/".length)),
          )
        : undefined;
      check(
        !publicRoute.startsWith("/product/") || artwork,
        publicRoute,
        "public route coverage",
        "indexable product route has no matching public catalog artwork",
      );
      const routeHtml = publicRoute === "/" ? homepage : await readRoute(publicRoute);
      htmlByRoute.set(publicRoute, routeHtml);
      validateRoute(
        publicRoute,
        routeHtml,
        siteUrl,
        expectedTypes,
        { metadata, artwork },
      );
      if (artwork) {
        productRoutesValidated += 1;
      } else {
        informationalRoutesValidated += 1;
      }
    });
  }

  await collectFailure(failures, "robots.txt / sitemap.xml", () =>
    validateDiscoveryFiles(siteUrl),
  );
  await collectFailure(failures, "internal links", () =>
    validateInternalLinks(siteUrl, htmlByRoute),
  );
  await collectFailure(failures, "/404", async () => {
    const notFoundRoute = "/404";
    const metadata = getRouteMetadata(notFoundRoute, publicCatalog);
    validateRoute(
      notFoundRoute,
      await readFile(path.join(outputDirectory, "404.html"), "utf8"),
      siteUrl,
      ["Organization", "WebSite", "WebPage"],
      { metadata },
    );
  });
  await collectFailure(failures, "/product/not-a-real-artcovr-slug", async () => {
    try {
      await readFile(routeFile("/product/not-a-real-artcovr-slug"), "utf8");
      seoFailure(
        "/product/not-a-real-artcovr-slug",
        "soft 404",
        "an invalid product route was emitted as a valid static page",
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("soft 404")) throw error;
    }
  });

  if (reportFailures(failures)) return;

  console.log(
    `[SEO] validated /, /archive, ${informationalRoutesValidated} informational routes, ${productRoutesValidated} product routes, 404 behavior, internal links, robots.txt, sitemap.xml, llms files, and catalog-facts.json (${publicCatalog.length} catalog images)`,
  );
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  await main();
}

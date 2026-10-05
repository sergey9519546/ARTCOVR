import { createHash } from "node:crypto";

export const PUBLIC_ROUTE_USER_AGENTS = [
  {
    name: "browser",
    value:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  },
  {
    name: "googlebot",
    value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NEGATIVE_PATHS = [
  "/product/not-a-real-artcovr-route",
  "/cover-art/not-a-real-genre",
  "/not-a-real-artcovr-route",
];

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getAttribute(tag, name) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(
    tag,
  )?.[1];
}

function plainText(fragment) {
  return fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function inspectHtml(body) {
  const canonicalTag = [...body.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => getAttribute(tag, "rel")?.toLowerCase() === "canonical");
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? "";
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? "";

  return {
    title: plainText(title),
    h1: plainText(h1),
    canonical: canonicalTag
      ? decodeXml(getAttribute(canonicalTag, "href") ?? "")
      : "",
  };
}

function routeVariants(sitemapUrl) {
  const original = new URL(sitemapUrl);
  const pathWithoutTrailingSlash =
    original.pathname === "/" ? "/" : original.pathname.replace(/\/+$/, "");
  const alternatePath =
    pathWithoutTrailingSlash === "/"
      ? "/"
      : original.pathname === pathWithoutTrailingSlash
        ? `${pathWithoutTrailingSlash}/`
        : pathWithoutTrailingSlash;
  const alternateUrl = new URL(alternatePath, original.origin).toString();

  return [
    { variant: "sitemap", url: original.toString() },
    ...(alternateUrl === original.toString()
      ? []
      : [
          {
            variant:
              alternatePath.endsWith("/") ? "trailing-slash" : "no-trailing-slash",
            url: alternateUrl,
          },
        ]),
  ];
}

async function discardBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The redirect decision and its diagnostics do not depend on its body.
  }
}

async function fetchWithRedirects({
  url,
  userAgent,
  expectedOrigin,
  fetchImpl,
  maxRedirects = 10,
}) {
  let currentUrl = new URL(url);
  const redirects = [];

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": userAgent },
    });
    const location = response.headers.get("location");

    if (!REDIRECT_STATUSES.has(response.status)) {
      return {
        status: response.status,
        finalUrl: currentUrl.toString(),
        contentType: response.headers.get("content-type") ?? "",
        redirects,
        body: await response.text(),
      };
    }

    if (!location) {
      await discardBody(response);
      return {
        status: response.status,
        finalUrl: currentUrl.toString(),
        contentType: response.headers.get("content-type") ?? "",
        redirects,
        body: "",
        failure: `HTTP ${response.status} redirect had no Location header`,
      };
    }

    const nextUrl = new URL(location, currentUrl);
    redirects.push({
      status: response.status,
      from: currentUrl.toString(),
      to: nextUrl.toString(),
    });
    await discardBody(response);

    if (nextUrl.origin !== expectedOrigin) {
      return {
        status: response.status,
        finalUrl: nextUrl.toString(),
        contentType: "",
        redirects,
        body: "",
        failure: `redirect left the expected origin (${expectedOrigin})`,
      };
    }

    if (hop === maxRedirects) {
      return {
        status: response.status,
        finalUrl: currentUrl.toString(),
        contentType: "",
        redirects,
        body: "",
        failure: `redirect limit exceeded (${maxRedirects})`,
      };
    }

    currentUrl = nextUrl;
  }

  throw new Error("unreachable redirect state");
}

async function runConcurrent(items, concurrency, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await callback(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function readSitemapLocations(sitemapBody, origin) {
  const locations = [];
  const failures = [];
  for (const match of sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const value = decodeXml(match[1]);
    try {
      const url = new URL(value);
      if (url.origin !== origin) {
        failures.push({
          kind: "sitemap",
          route: value,
          issue: `sitemap URL is outside the release origin (${origin})`,
        });
      } else if (url.search || url.hash) {
        failures.push({
          kind: "sitemap",
          route: value,
          issue: "sitemap URL contains a query or fragment",
        });
      } else {
        locations.push(url.toString());
      }
    } catch {
      failures.push({
        kind: "sitemap",
        route: value,
        issue: "sitemap contains an invalid URL",
      });
    }
  }

  const duplicateUrls = locations.filter(
    (url, index) => locations.indexOf(url) !== index,
  );
  for (const url of new Set(duplicateUrls)) {
    failures.push({
      kind: "sitemap",
      route: url,
      issue: "sitemap contains a duplicate URL",
    });
  }

  return { locations: [...new Set(locations)], failures };
}

function publicRouteIssues(record, expectedCanonical) {
  const issues = [];
  if (record.failure) issues.push(record.failure);
  if (record.status !== 200) issues.push(`expected HTTP 200, received ${record.status}`);
  if (!record.contentType.toLowerCase().includes("text/html")) {
    issues.push(`expected text/html, received ${record.contentType || "no content type"}`);
  }
  if (!record.title || /page not found/i.test(record.title)) {
    issues.push(`missing route-specific title (${record.title || "none"})`);
  }
  if (!record.h1 || /^page not found\.?$/i.test(record.h1)) {
    issues.push(`missing route-specific h1 (${record.h1 || "none"})`);
  }
  if (record.canonical !== expectedCanonical) {
    issues.push(
      `expected canonical ${expectedCanonical}, received ${record.canonical || "none"}`,
    );
  }
  if (
    new URL(expectedCanonical).pathname.startsWith("/product/") &&
    !record.hasStructuredData
  ) {
    issues.push("product page is missing structured metadata");
  }
  return issues;
}

function negativeRouteIssues(record) {
  const issues = [];
  if (record.failure) issues.push(record.failure);
  if (record.status !== 404) issues.push(`expected genuine HTTP 404, received ${record.status}`);
  if (!/page not found/i.test(record.title)) {
    issues.push(`expected not-found title, received ${record.title || "none"}`);
  }
  if (!/^page not found\.?$/i.test(record.h1)) {
    issues.push(`expected not-found h1, received ${record.h1 || "none"}`);
  }
  return issues;
}

async function probe(request, origin, fetchImpl) {
  const base = {
    kind: request.kind,
    route: request.route,
    variant: request.variant,
    agent: request.agent.name,
    requestedUrl: request.url,
  };

  try {
    const response = await fetchWithRedirects({
      url: request.url,
      userAgent: request.agent.value,
      expectedOrigin: origin,
      fetchImpl,
    });
    const inspected = inspectHtml(response.body);
    const record = {
      ...base,
      status: response.status,
      finalUrl: response.finalUrl,
      contentType: response.contentType,
      redirects: response.redirects,
      title: inspected.title,
      h1: inspected.h1,
      canonical: inspected.canonical,
      hasStructuredData:
        /<script\b[^>]*type=["']application\/ld\+json["']/i.test(response.body) ||
        response.body.includes("ARTCOVR_ROUTE_STRUCTURED_DATA"),
      bodyHash: createHash("sha256").update(response.body).digest("hex"),
      failure: response.failure,
    };
    const issues =
      request.kind === "public"
        ? publicRouteIssues(record, request.expectedCanonical)
        : negativeRouteIssues(record);
    return {
      ...record,
      issues,
      ok: issues.length === 0,
    };
  } catch (error) {
    const issue = `request failed: ${error instanceof Error ? error.message : String(error)}`;
    return {
      ...base,
      status: null,
      finalUrl: request.url,
      contentType: "",
      redirects: [],
      title: "",
      h1: "",
      canonical: "",
      bodyHash: "",
      failure: issue,
      issues: [issue],
      ok: false,
    };
  }
}

function parityIssues(checks) {
  const failures = [];
  const groups = new Map();

  for (const check of checks.filter(
    (item) => item.kind === "public" && item.ok,
  )) {
    const key = `${check.route}\n${check.variant}`;
    const group = groups.get(key) ?? [];
    group.push(check);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < PUBLIC_ROUTE_USER_AGENTS.length) continue;
    const first = group[0];
    for (const other of group.slice(1)) {
      if (
        first.status !== other.status ||
        first.finalUrl !== other.finalUrl ||
        first.title !== other.title ||
        first.h1 !== other.h1 ||
        first.canonical !== other.canonical ||
        first.bodyHash !== other.bodyHash
      ) {
        failures.push({
          kind: "user-agent parity",
          route: first.route,
          agent: other.agent,
          issue: `public HTML or final response differs from ${first.agent} for ${first.variant}`,
        });
      }
    }
  }

  const variantGroups = new Map();
  for (const check of checks.filter(
    (item) => item.kind === "public" && item.ok,
  )) {
    const key = `${check.route}\n${check.agent}`;
    const group = variantGroups.get(key) ?? [];
    group.push(check);
    variantGroups.set(key, group);
  }
  for (const group of variantGroups.values()) {
    if (group.length < 2) continue;
    const first = group[0];
    for (const other of group.slice(1)) {
      if (first.bodyHash !== other.bodyHash || first.canonical !== other.canonical) {
        failures.push({
          kind: "slash-variant parity",
          route: first.route,
          agent: first.agent,
          issue: `sitemap and slash-variant URLs resolve to different page content`,
        });
      }
    }
  }

  return failures;
}

export async function checkPublicRouteInventory({
  origin,
  sitemapBody,
  fetchImpl = fetch,
  concurrency = 10,
}) {
  const base = origin instanceof URL ? origin : new URL(origin);
  const { locations, failures: sitemapFailures } = readSitemapLocations(
    sitemapBody,
    base.origin,
  );
  if (locations.length === 0) {
    sitemapFailures.push({
      kind: "sitemap",
      route: new URL("/sitemap.xml", base).toString(),
      issue: "sitemap contains no same-origin public routes",
    });
  }

  const requests = [];
  for (const sitemapUrl of locations) {
    for (const variant of routeVariants(sitemapUrl)) {
      for (const agent of PUBLIC_ROUTE_USER_AGENTS) {
        requests.push({
          kind: "public",
          route: sitemapUrl,
          expectedCanonical: sitemapUrl,
          ...variant,
          agent,
        });
      }
    }
  }
  for (const path of NEGATIVE_PATHS) {
    const canonical = new URL(path, base.origin).toString();
    for (const variant of routeVariants(canonical)) {
      for (const agent of PUBLIC_ROUTE_USER_AGENTS) {
        requests.push({
          kind: "negative",
          route: canonical,
          ...variant,
          agent,
        });
      }
    }
  }

  const checks = await runConcurrent(requests, concurrency, (request) =>
    probe(request, base.origin, fetchImpl),
  );
  const failures = [
    ...sitemapFailures,
    ...checks.flatMap((check) =>
      check.issues.map((issue) => ({
        kind: check.kind,
        route: check.route,
        variant: check.variant,
        agent: check.agent,
        issue,
      })),
    ),
    ...parityIssues(checks),
  ];

  return {
    routeCount: locations.length,
    checkCount: checks.length,
    failures,
    checks,
  };
}

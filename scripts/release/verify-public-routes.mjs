import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  PUBLIC_ROUTE_USER_AGENTS,
  checkPublicRouteInventory,
} from "./public-route-inventory.mjs";

const SITEMAP_TIMEOUT_MS = 15_000;
const DEFAULT_REPORT_PATH = "/tmp/artcovr-public-route-report/report.json";

function parseReleaseOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function sanitizedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[invalid URL]";
  }
}

function sanitizedContentType(value) {
  return String(value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function sanitizedIssue(value) {
  const issue = String(value);
  if (/^request failed:/i.test(issue)) return "request failed";
  if (/^missing route-specific title/i.test(issue)) {
    return "missing route-specific title";
  }
  if (/^missing route-specific h1/i.test(issue)) {
    return "missing route-specific h1";
  }
  if (/^expected not-found title/i.test(issue)) {
    return "expected not-found title";
  }
  if (/^expected not-found h1/i.test(issue)) {
    return "expected not-found h1";
  }
  if (/^expected canonical/i.test(issue)) return "canonical URL mismatch";
  if (/^expected text\/html/i.test(issue)) {
    return "expected HTML content type";
  }
  return issue
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => sanitizedUrl(url))
    .slice(0, 400);
}

function sanitizeCheck(check) {
  return {
    kind: check.kind,
    route: sanitizedUrl(check.route),
    variant: check.variant,
    agent: check.agent,
    requestedUrl: sanitizedUrl(check.requestedUrl),
    finalUrl: sanitizedUrl(check.finalUrl),
    status: check.status,
    contentType: sanitizedContentType(check.contentType),
    canonical: sanitizedUrl(check.canonical),
    redirects: check.redirects.map((redirect) => ({
      status: redirect.status,
      from: sanitizedUrl(redirect.from),
      to: sanitizedUrl(redirect.to),
    })),
    issues: check.issues.map(sanitizedIssue),
  };
}

function sanitizeFailure(failure) {
  return {
    kind: failure.kind,
    route: sanitizedUrl(failure.route),
    variant: failure.variant,
    agent: failure.agent,
    issue: sanitizedIssue(failure.issue),
  };
}

export async function runPublicRouteCheck({
  releaseUrl,
  reportPath,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  const origin = parseReleaseOrigin(releaseUrl);
  const report = {
    schemaVersion: 1,
    checkedAt: now().toISOString(),
    origin: origin?.origin ?? null,
    success: false,
    sitemap: {
      requestedUrl: origin ? new URL("/sitemap.xml", origin).toString() : null,
      finalUrl: null,
      status: null,
      contentType: "",
      failure: null,
    },
    routeCount: 0,
    checkCount: 0,
    failures: [],
    checks: [],
  };

  if (!origin) {
    report.failures.push({
      kind: "configuration",
      route: "",
      issue:
        "ARTCOVR_RELEASE_URL must be an HTTPS origin without credentials, path, query, or fragment",
    });
  } else {
    const sitemapUrl = new URL("/sitemap.xml", origin);
    try {
      const response = await fetchImpl(sitemapUrl, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": PUBLIC_ROUTE_USER_AGENTS[0].value },
        signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
      });
      const finalSitemapUrl = response.url ? new URL(response.url) : sitemapUrl;
      report.sitemap.finalUrl = sanitizedUrl(finalSitemapUrl.toString());
      report.sitemap.status = response.status;
      report.sitemap.contentType = sanitizedContentType(
        response.headers.get("content-type"),
      );

      if (finalSitemapUrl.origin !== origin.origin) {
        report.sitemap.failure = "sitemap redirect left the configured origin";
      } else if (response.status !== 200) {
        report.sitemap.failure = `sitemap returned HTTP ${response.status}`;
      } else {
        const sitemapBody = await response.text();
        const inventory = await checkPublicRouteInventory({
          origin,
          sitemapBody,
          fetchImpl,
        });
        report.routeCount = inventory.routeCount;
        report.checkCount = inventory.checkCount;
        report.failures = inventory.failures.map(sanitizeFailure);
        report.checks = inventory.checks.map(sanitizeCheck);
      }
    } catch (error) {
      report.sitemap.failure = `sitemap request failed (${error instanceof Error ? error.name : "Error"})`;
    }

    if (report.sitemap.failure) {
      report.failures.unshift({
        kind: "sitemap",
        route: report.sitemap.requestedUrl,
        issue: report.sitemap.failure,
      });
    }
  }

  report.success = report.failures.length === 0;
  const outputPath = resolve(reportPath || DEFAULT_REPORT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, reportPath: outputPath };
}

function printFailure(check) {
  const redirects =
    check.redirects.length === 0
      ? "none"
      : check.redirects
          .map(({ status, from, to }) => `${status} ${from} -> ${to}`)
          .join(" | ");
  console.error(
    `[Public routes] ${check.route} [${check.agent}/${check.variant}] status=${check.status ?? "request failed"} final=${check.finalUrl || "none"} redirects=${redirects}: ${check.issues.join("; ")}`,
  );
}

async function main() {
  const { report, reportPath } = await runPublicRouteCheck({
    releaseUrl: process.env.ARTCOVR_RELEASE_URL,
    reportPath: process.env.ARTCOVR_PUBLIC_ROUTE_REPORT_PATH,
  });

  console.log(
    `[Public routes] ${report.success ? "OK" : "FAILED"}: ${report.routeCount} sitemap routes, ${report.checkCount} route checks, ${report.failures.length} reported failure(s).`,
  );
  console.log(`[Public routes] Sanitized report: ${reportPath}`);

  if (!report.success) {
    for (const check of report.checks.filter(
      (result) => result.issues.length > 0,
    )) {
      printFailure(check);
    }
    for (const failure of report.failures.filter(
      ({ kind }) => kind !== "public" && kind !== "negative",
    )) {
      console.error(
        `[Public routes] ${failure.kind} ${failure.route || ""}: ${failure.issue}`,
      );
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}

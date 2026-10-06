import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { runPublicRouteCheck } from "./verify-public-routes.mjs";

const origin = "https://artcovr.com";
const productPath = "/product/real-artwork";
const productUrl = `${origin}${productPath}`;
const publicHtml = `<!doctype html><html><head><title>Real Artwork | ARTCOVR</title><link rel="canonical" href="${productUrl}"><script type="application/ld+json">{}</script></head><body><h1>Real Artwork</h1><p>PRIVATE_RESPONSE_MARKER</p></body></html>`;
const notFoundHtml =
  "<!doctype html><html><head><title>Page Not Found | ARTCOVR</title></head><body><h1>Page not found.</h1></body></html>";

function fixtureFetch({
  breakGooglebot = false,
  breakExternalRedirect = false,
  failSitemap = false,
  exposeSensitiveTitle = false,
} = {}) {
  return async (input, options = {}) => {
    const url = new URL(input);
    const userAgent = options.headers?.["user-agent"] ?? "";
    assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname === "/sitemap.xml") {
      if (failSitemap) throw new TypeError("untrusted fetch detail");
      return new Response(
        `<urlset><url><loc>${productUrl}</loc></url></urlset>`,
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    if (url.pathname === productPath) {
      return new Response(null, {
        status: breakExternalRedirect ? 302 : 301,
        headers: {
          location: breakExternalRedirect
            ? "https://report-user:report-password@external.example/landing?token=private#fragment"
            : `${productPath}/`,
        },
      });
    }
    if (url.pathname === `${productPath}/`) {
      if (exposeSensitiveTitle) {
        return new Response(
          publicHtml.replace(
            "<title>Real Artwork | ARTCOVR</title>",
            "<title>Page Not Found INTERNAL_TITLE_MARKER</title>",
          ),
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          },
        );
      }
      if (breakGooglebot && /Googlebot/i.test(userAgent)) {
        return new Response(notFoundHtml, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response(publicHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response(notFoundHtml, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
}

async function withReport(t, run) {
  const directory = await mkdtemp(path.join(tmpdir(), "public-route-monitor-"));
  const reportPath = path.join(directory, "report.json");
  t.after(() => rm(directory, { recursive: true, force: true }));
  return run(reportPath);
}

test("runs and retains a sanitized full route inventory", async (t) => {
  await withReport(t, async (reportPath) => {
    const { report, reportPath: savedPath } = await runPublicRouteCheck({
      releaseUrl: origin,
      reportPath,
      fetchImpl: fixtureFetch(),
      now: () => new Date("2026-10-06T15:00:00.000Z"),
    });
    const savedReport = await readFile(savedPath, "utf8");
    const productCheck = report.checks.find(
      (check) => check.kind === "public" && check.agent === "browser",
    );

    assert.equal(report.success, true);
    assert.equal(report.checkedAt, "2026-10-06T15:00:00.000Z");
    assert.equal(report.routeCount, 1);
    assert.equal(report.checkCount, 16);
    assert.ok(productCheck);
    assert.equal(productCheck.status, 200);
    assert.equal(productCheck.contentType, "text/html");
    assert.equal(productCheck.redirects.length, 1);
    assert.equal(productCheck.finalUrl, `${origin}${productPath}/`);
    assert.doesNotMatch(
      savedReport,
      /PRIVATE_RESPONSE_MARKER|untrusted fetch detail/,
    );
    assert.match(savedReport, /"agent": "googlebot"/);
  });
});

test("retains route, agent, redirect chain and status for crawler-only failures", async (t) => {
  await withReport(t, async (reportPath) => {
    const { report } = await runPublicRouteCheck({
      releaseUrl: origin,
      reportPath,
      fetchImpl: fixtureFetch({ breakGooglebot: true }),
    });
    const googlebotFailure = report.checks.find(
      (check) =>
        check.kind === "public" &&
        check.agent === "googlebot" &&
        check.issues.some((issue) => issue.includes("expected HTTP 200")),
    );

    assert.equal(report.success, false);
    assert.ok(googlebotFailure);
    assert.equal(googlebotFailure.route, productUrl);
    assert.equal(googlebotFailure.status, 404);
    assert.equal(googlebotFailure.redirects.length, 1);
    assert.ok(report.failures.some((failure) => failure.agent === "googlebot"));
  });
});

test("retains a sanitized sitemap failure report", async (t) => {
  await withReport(t, async (reportPath) => {
    const { report } = await runPublicRouteCheck({
      releaseUrl: origin,
      reportPath,
      fetchImpl: fixtureFetch({ failSitemap: true }),
    });

    assert.equal(report.success, false);
    assert.equal(report.routeCount, 0);
    assert.equal(report.checkCount, 0);
    assert.equal(report.sitemap.failure, "sitemap request failed (TypeError)");
    assert.doesNotMatch(JSON.stringify(report), /untrusted fetch detail/);
  });
});

test("strips credentials and query data from redirect diagnostics", async (t) => {
  await withReport(t, async (reportPath) => {
    const { report } = await runPublicRouteCheck({
      releaseUrl: origin,
      reportPath,
      fetchImpl: fixtureFetch({ breakExternalRedirect: true }),
    });
    const failedProductCheck = report.checks.find(
      (check) => check.kind === "public" && check.agent === "browser",
    );

    assert.ok(failedProductCheck);
    assert.equal(failedProductCheck.status, 302);
    assert.equal(
      failedProductCheck.finalUrl,
      "https://external.example/landing",
    );
    assert.equal(
      failedProductCheck.redirects[0]?.to,
      "https://external.example/landing",
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /report-user|report-password|token=private|fragment/,
    );
  });
});

test("does not copy unexpected page titles into the retained report", async (t) => {
  await withReport(t, async (reportPath) => {
    const { report } = await runPublicRouteCheck({
      releaseUrl: origin,
      reportPath,
      fetchImpl: fixtureFetch({ exposeSensitiveTitle: true }),
    });

    assert.equal(report.success, false);
    assert.ok(
      report.checks.some((check) =>
        check.issues.includes("missing route-specific title"),
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(report),
      /INTERNAL_TITLE_MARKER|PRIVATE_RESPONSE_MARKER/,
    );
  });
});

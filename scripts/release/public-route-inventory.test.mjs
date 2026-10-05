import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import { checkPublicRouteInventory } from "./public-route-inventory.mjs";

function page({ title, h1, canonical }) {
  return `<!doctype html><html><head><title>${title}</title><link rel="canonical" href="${canonical}"><script type="application/ld+json">{}</script></head><body><h1>${h1}</h1></body></html>`;
}

async function serveFixture({ breakGooglebot = false } = {}) {
  const canonicalPath = "/product/real-artwork";
  const html = page({
    title: "Real Artwork | ARTCOVR",
    h1: "Real Artwork",
    canonical: `http://127.0.0.1/__PORT__${canonicalPath}`,
  });
  const notFound = page({
    title: "Page Not Found | ARTCOVR",
    h1: "Page not found.",
    canonical: "",
  });
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/sitemap.xml") {
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(
        `<urlset><url><loc>http://127.0.0.1:${server.address().port}${canonicalPath}</loc></url></urlset>`,
      );
      return;
    }
    if (path === canonicalPath) {
      response.writeHead(301, { location: `${canonicalPath}/` });
      response.end();
      return;
    }
    if (path === `${canonicalPath}/`) {
      if (breakGooglebot && /Googlebot/i.test(request.headers["user-agent"])) {
        response.writeHead(404, { "content-type": "text/html" });
        response.end(notFound);
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        html.replaceAll(
          "http://127.0.0.1/__PORT__",
          `http://127.0.0.1:${server.address().port}`,
        ),
      );
      return;
    }
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end(notFound);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

test("checks every sitemap route under both agents and slash variants, preserving redirect chains", async (t) => {
  const server = await serveFixture();
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const origin = new URL(`http://127.0.0.1:${server.address().port}`);
  const canonical = `${origin.origin}/product/real-artwork`;
  const sitemapBody = `<urlset><url><loc>${canonical}</loc></url></urlset>`;

  const report = await checkPublicRouteInventory({ origin, sitemapBody });

  assert.equal(report.routeCount, 1);
  assert.equal(report.checkCount, 16);
  assert.deepEqual(report.failures, []);
  const validRouteChecks = report.checks.filter((check) => check.kind === "public");
  assert.equal(validRouteChecks.length, 4);
  assert.ok(validRouteChecks.every((check) => check.status === 200));
  assert.ok(validRouteChecks.some((check) => check.redirects.length === 1));
  assert.ok(validRouteChecks.every((check) => check.canonical === canonical));
});

test("aggregates bot-only failures instead of stopping after the first route", async (t) => {
  const server = await serveFixture({ breakGooglebot: true });
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const origin = new URL(`http://127.0.0.1:${server.address().port}`);
  const canonical = `${origin.origin}/product/real-artwork`;
  const sitemapBody = `<urlset><url><loc>${canonical}</loc></url></urlset>`;

  const report = await checkPublicRouteInventory({ origin, sitemapBody });
  const botFailures = report.failures.filter(
    (failure) => failure.agent === "googlebot" && failure.route === canonical,
  );

  assert.ok(botFailures.length >= 2);
  assert.ok(report.checks.some((check) => check.agent === "browser" && check.ok));
  assert.equal(report.checkCount, 16);
});

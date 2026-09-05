import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const releaseUrl = process.env.ARTCOVR_RELEASE_URL;
if (!releaseUrl) {
  console.error("ARTCOVR_RELEASE_URL is required. Set it to the deployed storefront origin before running the live release smoke check.");
  process.exit(2);
}

let base;
try {
  base = new URL(releaseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("must be an HTTPS origin without a path, query, or hash");
  }
} catch (error) {
  console.error(`ARTCOVR_RELEASE_URL is invalid: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

const apiBase = new URL(process.env.ARTCOVR_RELEASE_API_URL || base);
const diagnostics = [];
const check = async (name, url, options = {}) => {
  const response = await fetch(url, { redirect: "manual", ...options });
  const body = await response.text();
  diagnostics.push({ name, url: String(url), status: response.status, body: body.slice(0, 500) });
  if (response.status >= 400) throw new Error(`${name} returned HTTP ${response.status}`);
  return { response, body };
};

try {
  const home = await check("homepage", new URL("/", base));
  if (!home.body.includes("<title>") || !home.body.includes(`https://${base.host}`)) {
    throw new Error("homepage is missing title or canonical-origin metadata");
  }

  for (const path of ["/archive", "/about"]) {
    const page = await check(path, new URL(path, base));
    if (!page.body.includes("<title>")) throw new Error(`${path} is missing a title`);
  }

  const sitemap = await check("sitemap.xml", new URL("/sitemap.xml", base));
  if (!sitemap.body.includes(`<loc>${base.origin}/</loc>`)) throw new Error("sitemap does not use the release origin");
  const firstProduct = sitemap.body.match(new RegExp(`<loc>(${base.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/product/[^<]+)</loc>`))?.[1];
  if (firstProduct) {
    const product = await check("representative product route", firstProduct);
    if (!product.body.includes("application/ld+json") && !product.body.includes("ARTCOVR_ROUTE_STRUCTURED_DATA")) {
      throw new Error("representative product route is missing structured metadata");
    }
  }

  const robots = await check("robots.txt", new URL("/robots.txt", base));
  if (!robots.body.includes(`Sitemap: ${base.origin}/sitemap.xml`)) throw new Error("robots.txt does not advertise the release sitemap");

  const health = await check("API health", new URL("/api/healthz", apiBase));
  if (!/"status"\s*:\s*"ok"/.test(health.body)) throw new Error("API health did not report status ok");

  const missingSignature = await fetch(new URL("/api/stripe/webhook", apiBase), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "evt_release_probe" }),
  });
  if (missingSignature.status !== 400) throw new Error(`webhook missing-signature probe returned HTTP ${missingSignature.status}`);

  const invalidSignature = await fetch(new URL("/api/stripe/webhook", apiBase), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=1700000000,v1=0000000000000000000000000000000000000000000000000000000000000000",
    },
    body: JSON.stringify({ id: "evt_release_probe" }),
  });
  if (invalidSignature.status !== 400) throw new Error(`webhook invalid-signature probe returned HTTP ${invalidSignature.status}`);

  console.log("Live release smoke OK: storefront routes, metadata, database-backed API health, and webhook rejection path.");
} catch (error) {
  const outputDirectory = process.env.ARTCOVR_RELEASE_DIAGNOSTICS_DIR || "/tmp/artcovr-release-diagnostics";
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(resolve(outputDirectory, "release-smoke.json"), JSON.stringify({ checkedAt: new Date().toISOString(), diagnostics }, null, 2));
  console.error(`Live release smoke FAILED: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`Diagnostics retained at ${resolve(outputDirectory, "release-smoke.json")}`);
  process.exit(1);
}
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const webArtifact = await readFile(
  resolve(root, "artifacts/artcovr/.replit-artifact/artifact.toml"),
  "utf8",
);
const viteConfig = await readFile(
  resolve(root, "artifacts/artcovr/vite.config.ts"),
  "utf8",
);
const apiArtifact = await readFile(
  resolve(root, "artifacts/api-server/.replit-artifact/artifact.toml"),
  "utf8",
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const siteUrl = process.env.VITE_SITE_URL || "https://artcovr.com";
let site;
try {
  site = new URL(siteUrl);
} catch {
  failures.push(`VITE_SITE_URL is not a valid URL: ${siteUrl}`);
}

if (site) {
  expect(site.protocol === "https:", "VITE_SITE_URL must use HTTPS.");
  expect(!site.username && !site.password && !site.search && !site.hash, "VITE_SITE_URL must be an origin without credentials, query, or hash.");
  expect(site.pathname === "/" || site.pathname === "", "VITE_SITE_URL must not contain a base path.");
}

expect(webArtifact.includes("BASE_PATH = \"/\""), "The web artifact must declare BASE_PATH = \"/\".");
expect(viteConfig.includes("allowedHosts: true"), "The web preview must allow the Replit proxy host.");
expect(webArtifact.includes('from = "/api"') || apiArtifact.includes('paths = ["/api"]'), "The deployment must route /api to the API service.");
expect(webArtifact.includes('to = "/404.html"'), "The static web artifact must have a final 404 rewrite.");
expect(apiArtifact.includes('path = "/api/healthz"'), "The API artifact must use /api/healthz as its startup health path.");

if (failures.length) {
  console.error("Runtime contract FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Runtime contract OK: canonical origin, root base path, proxy routing, and health path are configured.");
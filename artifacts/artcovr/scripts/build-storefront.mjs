import path from "node:path";
import { spawnSync } from "node:child_process";

const storefrontRoot = path.resolve(import.meta.dirname, "..");
const configuredSiteUrl = process.env.VITE_SITE_URL;
const siteUrl = configuredSiteUrl || "https://artcovr.local";
const result = spawnSync(
  process.execPath,
  [
    path.join(storefrontRoot, "node_modules/vite/bin/vite.js"),
    "build",
    "--config",
    "vite.config.ts",
  ],
  {
    cwd: storefrontRoot,
    env: {
      ...process.env,
      PORT: process.env.PORT || "5000",
      BASE_PATH: process.env.BASE_PATH || "/",
      VITE_SITE_URL: siteUrl,
      VITE_CLERK_PUBLISHABLE_KEY: configuredSiteUrl
        ? process.env.VITE_CLERK_PUBLISHABLE_KEY
        : "pk_live_local_build_placeholder",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
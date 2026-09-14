import path from "node:path";
import { spawnSync } from "node:child_process";

const storefrontRoot = path.resolve(import.meta.dirname, "..");
const configuredSiteUrl = process.env.VITE_SITE_URL;

if (!configuredSiteUrl) {
  throw new Error(
    "VITE_SITE_URL is required for production builds. Set it to the canonical HTTPS site origin.",
  );
}

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
      VITE_SITE_URL: configuredSiteUrl,
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
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
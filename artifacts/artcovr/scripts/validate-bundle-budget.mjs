import { gzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const storefrontRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(storefrontRoot, "dist", "public");
const assetsDirectory = path.join(outputDirectory, "assets");

// Keep the homepage below Vite's large-chunk warning threshold and leave a
// small, explicit transfer budget for the initial JavaScript request.
const maxEntryBytes = 500_000;
const maxEntryGzipBytes = 130_000;

function formatBytes(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function runBuild() {
  const result = spawnSync(
    process.execPath,
    [path.join(storefrontRoot, "node_modules/vite/bin/vite.js"), "build", "--config", "vite.config.ts"],
    {
      cwd: storefrontRoot,
      env: {
        ...process.env,
        PORT: process.env.PORT || "5000",
        BASE_PATH: process.env.BASE_PATH || "/",
        VITE_SITE_URL: process.env.VITE_SITE_URL || "https://artcovr.local",
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
}

function entryAssetFromHtml(html) {
  const scriptSources = [
    ...html.matchAll(
      /<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi,
    ),
  ].map((match) => match[1]);

  if (scriptSources.length === 0) {
    throw new Error("Could not identify the homepage module entry in index.html.");
  }

  const entryPath = new URL(scriptSources[0], "https://artcovr.local").pathname;
  const assetsMarker = "/assets/";
  const assetsIndex = entryPath.lastIndexOf(assetsMarker);
  if (assetsIndex === -1) {
    throw new Error(`Homepage entry is not an emitted asset: ${entryPath}`);
  }
  const relativeAssetPath = entryPath.slice(assetsIndex + 1);
  const resolvedAssetPath = path.resolve(outputDirectory, relativeAssetPath);
  const resolvedOutputDirectory = path.resolve(outputDirectory);

  if (
    !resolvedAssetPath.startsWith(`${resolvedOutputDirectory}${path.sep}`)
  ) {
    throw new Error(`Homepage entry points outside dist/public: ${entryPath}`);
  }

  return resolvedAssetPath;
}

async function readChunk(filePath) {
  const contents = await readFile(filePath);
  return {
    name: path.relative(outputDirectory, filePath),
    bytes: contents.byteLength,
    gzipBytes: gzipSync(contents).byteLength,
  };
}

async function main() {
  runBuild();

  const indexHtml = await readFile(
    path.join(outputDirectory, "index.html"),
    "utf8",
  );
  const entryPath = entryAssetFromHtml(indexHtml);
  const entry = await readChunk(entryPath);
  const emittedFiles = await readdir(assetsDirectory, { withFileTypes: true });
  const chunks = (
    await Promise.all(
      emittedFiles
        .filter((file) => file.isFile() && file.name.endsWith(".js"))
        .map((file) => readChunk(path.join(assetsDirectory, file.name))),
    )
  ).sort((left, right) => right.bytes - left.bytes);

  console.log(
    `[Bundle] Homepage entry: ${entry.name} — ${formatBytes(entry.bytes)} minified, ${formatBytes(entry.gzipBytes)} gzip`,
  );
  console.log(
    `[Bundle] Budgets: ${formatBytes(maxEntryBytes)} minified, ${formatBytes(maxEntryGzipBytes)} gzip`,
  );
  console.log("[Bundle] Largest emitted JavaScript chunks:");
  for (const chunk of chunks.slice(0, 10)) {
    console.log(
      `- ${chunk.name}: ${formatBytes(chunk.bytes)} minified, ${formatBytes(chunk.gzipBytes)} gzip`,
    );
  }

  const failures = [];
  if (entry.bytes > maxEntryBytes) {
    failures.push(
      `homepage entry is ${formatBytes(entry.bytes)}, over the ${formatBytes(maxEntryBytes)} minified budget`,
    );
  }
  if (entry.gzipBytes > maxEntryGzipBytes) {
    failures.push(
      `homepage entry is ${formatBytes(entry.gzipBytes)} gzip, over the ${formatBytes(maxEntryGzipBytes)} gzip budget`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`[Bundle] budget check failed:\n- ${failures.join("\n- ")}`);
  }

  console.log("[Bundle] Homepage entry is within budget.");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
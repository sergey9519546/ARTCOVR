import { readdir, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const artworkDirectory = fileURLToPath(
  new URL("../public/assets/artworks/", import.meta.url),
);
const outputDirectory = path.join(artworkDirectory, "optimized");

await mkdir(outputDirectory, { recursive: true });

const entries = await readdir(artworkDirectory, { withFileTypes: true });
const sourceFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".jpg"))
  .map((entry) => entry.name)
  .sort();

if (sourceFiles.length === 0) {
  throw new Error(`No JPEG artwork sources found in ${artworkDirectory}`);
}

function convert(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("cwebp", ["-quiet", "-mt", "-metadata", "none", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput += chunk;
    });
    child.on("error", (error) => {
      reject(
        new Error(
          `Unable to run cwebp. Install libwebp before generating artwork derivatives: ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`cwebp failed for ${args[0]}: ${errorOutput.trim()}`));
      }
    });
  });
}

for (const filename of sourceFiles) {
  const source = path.join(artworkDirectory, filename);
  const basename = filename.slice(0, -".jpg".length);
  await convert([
    "-q",
    "82",
    source,
    "-o",
    path.join(outputDirectory, `${basename}.webp`),
  ]);
  await convert([
    "-q",
    "78",
    "-resize",
    "640",
    "640",
    source,
    "-o",
    path.join(outputDirectory, `${basename}-640.webp`),
  ]);
}

console.log(
  `Generated ${sourceFiles.length * 2} WebP derivatives from ${sourceFiles.length} JPEG artworks.`,
);
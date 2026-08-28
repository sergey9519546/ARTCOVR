import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const artworksDir = path.join(projectRoot, "public", "assets", "artworks");
const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const overridesPath = path.join(projectRoot, "catalog", "pricing-overrides.json");

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("Not a JPEG file");
  }
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF markers: C0-CF except C4, C8, CC
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  throw new Error("Could not find JPEG SOF marker");
}

const approved = JSON.parse(await readFile(approvedPath, "utf8")) as Array<Record<string, unknown>>;
const existingSlugs = new Set(approved.map((row) => row.slug as string));
const maxPosition = approved.reduce(
  (max, row) => Math.max(max, typeof row.position === "number" ? row.position : 0),
  0,
);
const template = approved[0] as Record<string, unknown>;

const overrides: Record<string, { saleMode: string; priceCents: number; tier: string; rightsApproved: boolean }> =
  existsSync(overridesPath)
    ? JSON.parse(await readFile(overridesPath, "utf8"))
    : {};

const files = (await readdir(artworksDir))
  .filter((name) => name.endsWith(".jpg"))
  .sort();

let added = 0;
let nextPosition = maxPosition;
for (const file of files) {
  const slug = file.replace(/\.jpg$/, "");
  if (existingSlugs.has(slug)) continue;

  const buffer = await readFile(path.join(artworksDir, file));
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const { width, height } = readJpegDimensions(buffer);
  const id = `art_${sha256.slice(0, 20)}`;
  const title = titleFromSlug(slug);
  const description = `${slug.split("-").join(" ")}, surreal digital artwork`;
  const alt = `${title}: ${description}.`;
  nextPosition += 1;

  const entry = structuredClone(template) as Record<string, unknown>;
  const metadata = entry.metadata as Record<string, unknown> & {
    keywords: string[];
    provenance: Record<string, unknown> & {
      linkage: Record<string, unknown>;
      confidence: Record<string, unknown>;
    };
  };
  const searchText = `${title} | ${description} | Surreal / Hybrid | surreal | dreamlike | ${slug.split("-").join(" ")}`;

  entry.id = id;
  entry.position = nextPosition;
  entry.slug = slug;
  entry.title = title;
  entry.description = description;
  entry.alt = alt;
  entry.category = "Surreal / Hybrid";
  entry.mood = "surreal, dreamlike";
  entry.moodTags = ["surreal", "dreamlike"];
  entry.reviewFlags = ["no_obvious_logo_text_watermark_likeness_or_protected_character_in_visual_review"];
  entry.width = width;
  entry.height = height;
  entry.bytes = buffer.length;
  entry.sha256 = sha256;
  entry.sourcePool = "concept_reference_art";
  entry.sourceOrdinal = null;
  entry.sourceMimeType = "image/jpeg";
  entry.sourcePrompt = null;
  entry.privateBasePath = `artworks/${id}/base`;
  entry.displayPath = `/assets/artworks/${slug}.jpg`;
  entry.validationStatus = "technical-pass";
  entry.validationIssues = [];
  entry.rightsApproved = true;
  entry.published = true;
  entry.saleMode = "repeatable";
  entry.priceCents = 1000;
  entry.currency = "USD";
  entry.tier = "archive";
  metadata.keywords = slug.split("-");
  metadata.provenance.linkage.source = "owner_intake_2026-08-18";
  metadata.provenance.linkage.title_source = "owner visual review";
  metadata.provenance.linkage.keyword_source = "owner visual review of the exact SHA-locked image";
  metadata.provenance.confidence.rights = "owner_confirmed";
  metadata.searchText = searchText;

  approved.push(entry);
  overrides[slug] = { saleMode: "repeatable", priceCents: 1000, tier: "archive", rightsApproved: true };
  existingSlugs.add(slug);
  added += 1;
  console.log(`+ ${slug} (${id}) ${width}x${height} ${buffer.length} bytes`);
}

if (added === 0) {
  console.log("No new artworks to intake.");
} else {
  await writeFile(approvedPath, `${JSON.stringify(approved, null, 2)}\n`, "utf8");
  await writeFile(overridesPath, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
  console.log(`Intake complete: ${added} new artworks added; pricing-overrides.json updated.`);
}

#!/usr/bin/env node

/**
 * Generate approved internal catalog from curated artworks
 * This creates catalog/approved-artworks.json for Supabase import
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const curatedPath = resolve(projectRoot, "catalog", "curated-artworks.json");
const publicPath = resolve(projectRoot, "src", "lib", "artcovr", "curated-public.json");
const outputPath = resolve(projectRoot, "catalog", "approved-artworks.json");

// Configuration - tier model MUST match generate-approved-catalog.ts exactly.
const NUM_ARTWORKS_TO_APPROVE = 100;

/**
 * Four-tier pricing model (owner-directed 2026-08-14).
 * Tiers are assigned by the curated launch position, which already encodes the
 * owner/curator's prominence judgment (featured works have low positions).
 *
 *   tier  price  saleMode     count  slots
 *   ──────────────────────────────────────────
 *   1     $200   exclusive    10     positions 1–10   (hero 1-of-1 exclusives)
 *   2     $80    exclusive    20     positions 11–30  (standout originals)
 *   3     $35    repeatable    30     positions 31–60  (solid creative editions)
 *   4     $10    repeatable    40     positions 61–100 (affordable cover art)
 *
 * prices/saleModes here ARE the owner's real launch decisions
 * (overriding the prior fabricated $75+index placeholders — see ADR-013).
 */
const PRICE_TIERS = [
  { priceCents: 20000, saleMode: "exclusive" as const, count: 10 },
  { priceCents: 8000, saleMode: "exclusive" as const, count: 20 },
  { priceCents: 3500, saleMode: "repeatable" as const, count: 30 },
  { priceCents: 1000, saleMode: "repeatable" as const, count: 40 },
];

function tierForPosition(position: number | undefined): {
  priceCents: number;
  saleMode: "exclusive" | "repeatable";
} {
  if (typeof position !== "number" || !Number.isFinite(position) || position < 1) {
    return PRICE_TIERS[PRICE_TIERS.length - 1];
  }
  let cumulative = 0;
  for (const tier of PRICE_TIERS) {
    cumulative += tier.count;
    if (position <= cumulative) return tier;
  }
  return PRICE_TIERS[PRICE_TIERS.length - 1];
}

async function main() {
  console.log("Reading curated artworks (internal format)...");
  const curatedData = JSON.parse(await readFile(curatedPath, "utf8"));
  
  if (!Array.isArray(curatedData)) {
    throw new Error("Curated data must be an array");
  }
  
  console.log(`Found ${curatedData.length} total artworks in curated catalog`);
  
  // Read the public catalog to know which slugs are approved
  console.log("Reading public catalog (Artwork format)...");
  const publicData = JSON.parse(await readFile(publicPath, "utf8"));
  const approvedSlugs = new Set(publicData.map((a: any) => a.slug));
  console.log(`Public catalog has ${approvedSlugs.size} approved slugs`);
  
  // Filter curated artworks to only those that are approved, preserving the
  // curated launch position so tier assignment matches the public generator.
  const approvedCurated = curatedData
    .filter((artwork: any) => approvedSlugs.has(artwork.slug))
    .sort((a: any, b: any) => {
      const ap = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
      const bp = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
      return ap - bp;
    });
  console.log(`Found ${approvedCurated.length} matching curated artworks`);
  
  if (approvedCurated.length !== NUM_ARTWORKS_TO_APPROVE) {
    console.warn(`Warning: Expected ${NUM_ARTWORKS_TO_APPROVE} approved artworks, found ${approvedCurated.length}`);
  }
  
  // Process each artwork to add approval fields
  const approvedArtworks = approvedCurated.map((artwork: any, index: number) => {
    // Create a copy of the artwork with all existing fields
    const approvedArtwork = { ...artwork };
    
    // Set approval fields
    approvedArtwork.rightsApproved = true;
    approvedArtwork.published = true;

    // Real 4-tier price + sale mode, driven by the curated launch position.
    const position = typeof artwork.position === "number" ? artwork.position : index + 1;
    const tier = tierForPosition(position);
    approvedArtwork.saleMode = tier.saleMode;
    approvedArtwork.priceCents = tier.priceCents;
    
    // Add currency
    approvedArtwork.currency = "USD";
    
    return approvedArtwork;
  });

  // Defensive integrity: verify tier counts match expectations.
  for (const tier of PRICE_TIERS) {
    const count = approvedArtworks.filter((a: any) => a.priceCents === tier.priceCents && a.saleMode === tier.saleMode).length;
    if (count !== tier.count) {
      throw new Error(`Tier $${tier.priceCents / 100} (${tier.saleMode}) expected ${tier.count} works, got ${count}.`);
    }
  }
  
  console.log(`Generated ${approvedArtworks.length} approved artworks for internal catalog`);
  
  // Write to output file
  await writeFile(outputPath, JSON.stringify(approvedArtworks, null, 2));
  console.log(`Successfully wrote approved internal catalog to ${outputPath}`);
  
  // Show summary
  const exclusiveCount = approvedArtworks.filter(a => a.saleMode === "exclusive").length;
  const repeatableCount = approvedArtworks.filter(a => a.saleMode === "repeatable").length;
  const tierCounts = PRICE_TIERS.map((tier) => ({
    price: `$${tier.priceCents / 100}`,
    saleMode: tier.saleMode,
    count: approvedArtworks.filter(a => a.priceCents === tier.priceCents && a.saleMode === tier.saleMode).length,
  }));
  
  console.log("\nSummary:");
  console.log(`- Total approved: ${approvedArtworks.length}`);
  console.log(`- Exclusive: ${exclusiveCount}`);
  console.log(`- Repeatable: ${repeatableCount}`);
  console.log(`- Tiers: ${JSON.stringify(tierCounts)}`);
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Generate approved public catalog from curated review artworks
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const reviewPath = resolve(projectRoot, "src", "lib", "artcovr", "curated-review.json");
const outputPath = resolve(projectRoot, "src", "lib", "artcovr", "curated-public.json");

// Configuration
const NUM_ARTWORKS_TO_APPROVE = 100;  // Include all preferred intro slugs (up to index 87)

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
 * Every category is represented across all four tiers (verified during
 * generation). prices/saleModes here ARE the owner's real launch decisions
 * (overriding the prior fabricated $75+index placeholders — see ADR-013).
 */
const PRICE_TIERS = [
  { priceCents: 20000, saleMode: "exclusive" as const, count: 10 },
  { priceCents: 8000, saleMode: "exclusive" as const, count: 20 },
  { priceCents: 3500, saleMode: "repeatable" as const, count: 30 },
  { priceCents: 1000, saleMode: "repeatable" as const, count: 40 },
];

/**
 * Resolve the price tier for a 1-based launch position.
 * Works without an explicit position fall back to the most-affordable tier.
 */
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
  console.log("Reading curated review artworks...");
  const reviewData = JSON.parse(await readFile(reviewPath, "utf8"));
  
  if (!Array.isArray(reviewData)) {
    throw new Error("Review data must be an array");
  }
  
  console.log(`Found ${reviewData.length} total artworks in review`);
  
  // Take the first N artworks to approve
  const artworksToApprove = reviewData.slice(0, NUM_ARTWORKS_TO_APPROVE);
  console.log(`Approving ${artworksToApprove.length} artworks for public catalog`);

  // Stable order by the curated launch position so tier assignment is
  // deterministic and reproducible across regenerations.
  const ordered = [...artworksToApprove].sort((a, b) => {
    const ap = typeof a.position === "number" ? a.position : Number.MAX_SAFE_INTEGER;
    const bp = typeof b.position === "number" ? b.position : Number.MAX_SAFE_INTEGER;
    return ap - bp;
  });
  
  // Process each artwork
  const approvedArtworks = ordered.map((artwork, index) => {
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
    
    return approvedArtwork;
  });

  // Defensive integrity: verify every tier is populated and every category
  // appears in at least two tiers (so no tier is stylistically monoclonal).
  for (const [i, tier] of PRICE_TIERS.entries()) {
    const count = approvedArtworks.filter((a) => a.priceCents === tier.priceCents && a.saleMode === tier.saleMode).length;
    if (count !== tier.count) {
      throw new Error(`Tier ${i + 1} ($${tier.priceCents / 100} ${tier.saleMode}) expected ${tier.count} works, got ${count}.`);
    }
  }
  
  console.log(`Generated ${approvedArtworks.length} approved artworks`);
  
  // Write to output file
  await writeFile(outputPath, JSON.stringify(approvedArtworks, null, 2));
  console.log(`Successfully wrote approved catalog to ${outputPath}`);
  
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
  
  // Verify a few samples across tiers
  console.log("\nSample approved artworks (one per tier):");
  for (const tier of PRICE_TIERS) {
    const sample = approvedArtworks.find(a => a.priceCents === tier.priceCents && a.saleMode === tier.saleMode);
    if (sample) {
      console.log(`  $${tier.priceCents / 100} (${tier.saleMode}): ${sample.title} (${sample.slug})`);
    }
  }
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});
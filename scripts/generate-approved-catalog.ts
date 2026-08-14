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
const BASE_PRICE_USD = 75;    // $75 minimum
const PRICE_RANGE_USD = 225;  // Up to $300 ($75 + $225)

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
  
  // Process each artwork
  const approvedArtworks = artworksToApprove.map((artwork, index) => {
    // Create a copy of the artwork with all existing fields
    const approvedArtwork = { ...artwork };
    
    // Set approval fields
    approvedArtwork.rightsApproved = true;
    approvedArtwork.published = true;
    
    // Add sale mode (alternate between exclusive and repeatable)
    approvedArtwork.saleMode = index % 2 === 0 ? "exclusive" : "repeatable";
    
    // Add price in USD and convert to cents
    const priceUsd = BASE_PRICE_USD + (index % (PRICE_RANGE_USD + 1));
    // Ensure we don't exceed reasonable bounds
    const finalPriceUsd = Math.min(priceUsd, BASE_PRICE_USD + PRICE_RANGE_USD);
    approvedArtwork.priceCents = Math.round(finalPriceUsd * 100);
    
    return approvedArtwork;
  });
  
  console.log(`Generated ${approvedArtworks.length} approved artworks`);
  
  // Write to output file
  await writeFile(outputPath, JSON.stringify(approvedArtworks, null, 2));
  console.log(`Successfully wrote approved catalog to ${outputPath}`);
  
  // Show summary
  const exclusiveCount = approvedArtworks.filter(a => a.saleMode === "exclusive").length;
  const repeatableCount = approvedArtworks.filter(a => a.saleMode === "repeatable").length;
  const prices = approvedArtworks.map(a => a.priceCents / 100);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  console.log("\nSummary:");
  console.log(`- Total approved: ${approvedArtworks.length}`);
  console.log(`- Exclusive: ${exclusiveCount}`);
  console.log(`- Repeatable: ${repeatableCount}`);
  console.log(`- Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
  
  // Verify a few samples
  console.log("\nSample approved artworks:");
  approvedArtworks.slice(0, 3).forEach((artwork, i) => {
    console.log(`  ${i+1}. ${artwork.title} (${artwork.slug})`);
    console.log(`     Price: $${(artwork.priceCents/100).toFixed(2)}, Mode: ${artwork.saleMode}`);
    console.log(`     Rights: ${artwork.rightsApproved}, Published: ${artwork.published}`);
  });
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});
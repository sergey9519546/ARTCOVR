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

// Configuration - must match the public catalog script
const NUM_ARTWORKS_TO_APPROVE = 100;
const BASE_PRICE_USD = 75;
const PRICE_RANGE_USD = 225;

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
  
  // Filter curated artworks to only those that are approved
  const approvedCurated = curatedData.filter((artwork: any) => approvedSlugs.has(artwork.slug));
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
    
    // Add sale mode (alternate between exclusive and repeatable)
    approvedArtwork.saleMode = index % 2 === 0 ? "exclusive" : "repeatable";
    
    // Add price in USD and convert to cents
    const priceUsd = BASE_PRICE_USD + (index % (PRICE_RANGE_USD + 1));
    const finalPriceUsd = Math.min(priceUsd, BASE_PRICE_USD + PRICE_RANGE_USD);
    approvedArtwork.priceCents = Math.round(finalPriceUsd * 100);
    
    // Add currency
    approvedArtwork.currency = "USD";
    
    return approvedArtwork;
  });
  
  console.log(`Generated ${approvedArtworks.length} approved artworks for internal catalog`);
  
  // Write to output file
  await writeFile(outputPath, JSON.stringify(approvedArtworks, null, 2));
  console.log(`Successfully wrote approved internal catalog to ${outputPath}`);
  
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
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});

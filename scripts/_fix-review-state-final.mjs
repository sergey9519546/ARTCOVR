import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("C:/Users/serge/Desktop/ARTCOVR");

const approved = JSON.parse(
  await readFile(path.join(root, "catalog", "approved-artworks.json"), "utf8"),
);

// Owner-intake detection
const ownerIntakeSlugs = new Set(
  approved
    .filter(
      (r) =>
        (r.metadata?.provenance?.linkage?.source ?? "") ===
        "owner_intake_2026-08-18",
    )
    .map((r) => r.slug),
);
console.log("Owner-intake count:", ownerIntakeSlugs.size);

// Permanent private-exclusion set: 28 items that failed visual-clearance at the
// 0.63 threshold and are permanently staged, never published. They may exist
// in approved.json with tier "archive"/"featured" (the tag is advisory, not
// enforced by a pipeline gate); here we enforce the boundary.
const DELETE_SLUGS = new Set([
  "chair-after-midnight","cart-of-hours","last-sock-on-the-line","ink-bear-bloom",
  "graphic-surreal-pop","filing-cathedral","graphic-kinetic-surrealism","reverse-rain",
  "hyper-saturated-surreal-pop","payphone-for-forgiveness","camera-tears",
  "gritty-graphic-macabre","pinned-cloud","graphic-surrealist-minimalism",
  "tactile-organic-opulence","bold-graphic-neon-surrealism","cassette-veins",
  "graphic-angular-urbanism","vibrant-risograph-surrealism","mirror-box",
  "cold-cabinet","ocean-in-the-bath","days-almost-here","second-sunrise",
  "sleeping-cart","electric-cobalt-minimalist","pilgrim-of-the-prism-dawn",
  "grief-in-transit",
]);

// ── Build curated-review.json ────────────────────────────────────────────────
// Every non-owner-intake item receives a tier label:
//   tier: "delete"  → clearance failed; never in public
//   tier: "public"  → clearance passed; is in the public catalog
// No hard cap on count. LAUNCH_REVIEW_SIZE tracks the actual resulting count.
const tieredReview = approved
  .filter((src) => !ownerIntakeSlugs.has(src.slug))
  .map((src) => ({
    ...src,
    tier: src.tier === "delete" || DELETE_SLUGS.has(src.slug) ? "delete" : "public",
    image: src.displayPath,
  }));

console.log("  Fail:", tieredReview.filter((r) => r.tier === "delete").length);
console.log("  Pass:", tieredReview.filter((r) => r.tier === "public").length);
console.log("  Total:", tieredReview.length);

await writeFile(
  path.join(root, "src", "lib", "artcovr", "curated-review.json"),
  `${JSON.stringify(tieredReview, null, 2)}\n`,
  "utf8",
);
console.log("Wrote curated-review.json");

// ── Rebuild curated-public.json ──────────────────────────────────────────────
// Exclude:   1) items with tier "delete" in review 2) the 28 permanent deletions
// Owner-intake items bypass review and are always public (their tier comes from approved.json)
const reviewTiers = new Map(tieredReview.map((r) => [r.slug, r.tier]));

const publicRecords = approved
  .filter((src) => {
    if (src.tier === "delete" || DELETE_SLUGS.has(src.slug)) return false;
    if (ownerIntakeSlugs.has(src.slug)) return true;
    const rt = reviewTiers.get(src.slug);
    if (rt === "review" || rt === "delete") return false;
    return true;
  })
  .map((src) => ({
    id: src.id,
    slug: src.slug,
    title: src.title,
    image: src.displayPath,
    alt: src.alt,
    description: src.description,
    category: src.category,
    moodTags: src.moodTags,
    editionAvailable: src.editionAvailable ?? null,
    editionTotal: src.editionTotal ?? null,
    licenseLabel: src.licenseLabel ?? null,
    priceCents: src.priceCents ?? null,
    saleMode: src.saleMode,
    rightsApproved: src.rightsApproved ?? true,
    published: src.published ?? true,
    accentColor: src.accentColor,
    tier: src.tier ?? "archive",
  }));

console.log("Public records:", publicRecords.length);
const pubTiers = {};
for (const r of publicRecords) pubTiers[r.tier] = (pubTiers[r.tier] || 0) + 1;
console.log("Public tier dist:", JSON.stringify(pubTiers));

await writeFile(
  path.join(root, "src", "lib", "artcovr", "curated-public.json"),
  `${JSON.stringify(publicRecords, null, 2)}\n`,
  "utf8",
);
console.log("Wrote curated-public.json");

// ── Fix production-intro.json ─────────────────────────────────────────────────
const prodIntroPath = path.join(
  root, "src", "lib", "artcovr", "production-intro.json",
);
let productionIntro = JSON.parse(await readFile(prodIntroPath, "utf8"));
const publicSlugForIntro = new Set(publicRecords.map((r) => r.slug));
const badSlugs = ["open-circle", "portrait-in-slippage"];
productionIntro = productionIntro.filter(
  (s) => !badSlugs.includes(s) && publicSlugForIntro.has(s),
);
if (productionIntro.length < 6) {
  const fillers = [
    "cyan-passage","transit-diagram","approved-horizon","escalator-to-nowhere",
    "parking-meter-garden","tears-as-currency","the-dune-observatory",
    "mailbox-garden","unsaid-things","family-circuit","birthday-spark",
  ];
  for (const slug of fillers) {
    if (productionIntro.length >= 6) break;
    if (!productionIntro.includes(slug) && publicSlugForIntro.has(slug)) {
      productionIntro.push(slug);
    }
  }
}
if (productionIntro.length !== 6) {
  const featured = publicRecords
    .filter((r) => r.tier === "featured")
    .map((r) => r.slug)
    .slice(0, 6);
  productionIntro = featured;
}
console.log("production-intro.json:", JSON.stringify(productionIntro));
await writeFile(
  prodIntroPath,
  `${JSON.stringify(productionIntro, null, 2)}\n`,
  "utf8",
);
console.log("Wrote production-intro.json");

// ── Summary ──────────────────────────────────────────────────────────────────
const pSlugs = new Set(publicRecords.map((r) => r.slug));
const stillLeaking = tieredReview
  .filter((r) => r.tier === "delete" && pSlugs.has(r.slug))
  .map((r) => r.slug);
console.log("\n=== SUMMARY ===");
console.log("Public:", publicRecords.length);
console.log("Review:", tieredReview.length);
console.log(
  "Still leaking (delete-tier in public):", stillLeaking.length, stillLeaking.join(","),
);
console.log("All done.");
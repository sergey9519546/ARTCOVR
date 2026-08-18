import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("C:/Users/serge/Desktop/ARTCOVR");

const approved = JSON.parse(
  await readFile(path.join(root, "catalog", "approved-artworks.json"), "utf8"),
);

// Owner-intake detection (metadata.provenance.linkage.source === "owner_intake_2026-08-18")
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

// No hardcoded slug set. Tier comes directly from approved.json (canonical source).
// "delete" in approved.json means the owner or pipeline removed it — both
// review.json and the public catalog must respect that.
// Owner-intake items bypass the review queue entirely.
const tieredReview = approved
  .filter((src) => !ownerIntakeSlugs.has(src.slug))
  .map((src) => ({
    ...src,
    tier: src.tier === "delete" ? "delete" : "public",
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
const reviewTiers = new Map(tieredReview.map((r) => [r.slug, r.tier]));

const publicRecords = approved
  .filter((src) => {
    if (src.tier === "delete") return false;
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
// Remove items absent from public
const badSlugs = ["open-circle", "portrait-in-slippage"];
productionIntro = productionIntro.filter(
  (s) => !badSlugs.includes(s) && publicSlugForIntro.has(s),
);
// Backfill to 6 if needed
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
console.log("production-intro.json:", JSON.stringify(productionIntro));
await writeFile(
  prodIntroPath,
  `${JSON.stringify(productionIntro, null, 2)}\n`,
  "utf8",
);
console.log("Wrote production-intro.json");

console.log("All done.");
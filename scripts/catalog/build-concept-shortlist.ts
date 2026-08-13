import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type AuditRecord = {
  filename: string;
  path: string;
  prompt: string;
  source: string;
  classification: string;
  width: number;
  height: number;
  format: string;
  size_bytes: number;
  sha256: string;
};

type ConceptSpec = {
  index: number;
  title: string;
  keywords: string[];
  category: string;
  moodTags: [string, string, string];
  reviewFlags?: string[];
};

// Exact contact-sheet indices selected after three visual passes. Curator titles
// and keywords describe the joined image; unavailable source prompts stay null.
export const CONCEPT_SPECS: readonly ConceptSpec[] = [
  { index: 2, title: "Cart of Hours", keywords: ["shopping cart", "alarm clocks", "time", "object collage", "black field"], category: "Surreal / Hybrid", moodTags: ["temporal", "graphic", "uncanny"] },
  { index: 3, title: "Garden Drawer", keywords: ["open drawer", "miniature garden", "plants", "interior object", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["verdant", "quiet", "inventive"] },
  { index: 5, title: "Last Sock on the Line", keywords: ["single sock", "power line", "blue sky", "minimal object", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["wry", "minimal", "sunlit"] },
  { index: 8, title: "Nesting Appliance", keywords: ["bird nest", "white bird", "appliance", "organic machine", "illustrated collage"], category: "Mixed Media / Collage", moodTags: ["tender", "unexpected", "textural"] },
  { index: 14, title: "Weather to Carry", keywords: ["paper bag", "storm cloud", "landscape", "portable weather", "surreal print"], category: "Surreal / Hybrid", moodTags: ["stormy", "poetic", "spare"] },
  { index: 16, title: "Future Block", keywords: ["knife block", "single knife", "geometric object", "cyan", "minimal print"], category: "Graphic / Illustration / Print", moodTags: ["sharp", "minimal", "enigmatic"] },
  { index: 26, title: "Approved Horizon", keywords: ["modern house", "red sun", "reflective water", "architectural collage", "landscape"], category: "Mixed Media / Collage", moodTags: ["architectural", "balanced", "quiet"] },
  { index: 27, title: "Cyan Passage", keywords: ["architectural passage", "geometric forms", "fragmented interior", "mineral texture", "surreal collage"], category: "Mixed Media / Collage", moodTags: ["layered", "cyan", "enigmatic"] },
  { index: 28, title: "Transit Diagram", keywords: ["abstract transit map", "line network", "coral nodes", "paper texture", "graphic system"], category: "Minimal / Abstract", moodTags: ["systemic", "kinetic", "graphic"] },
  { index: 32, title: "Chair After Midnight", keywords: ["single red chair", "black room", "long shadow", "minimal stage", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["solitary", "theatrical", "minimal"] },
  { index: 37, title: "Open Circle", keywords: ["circular void", "ink ring", "botanical edge", "negative space", "abstract print"], category: "Minimal / Abstract", moodTags: ["open", "organic", "meditative"] },
  { index: 40, title: "Filing Cathedral", keywords: ["tower of drawers", "cathedral silhouette", "red sun", "archive", "architectural print"], category: "Graphic / Illustration / Print", moodTags: ["monumental", "archival", "symbolic"] },
  { index: 42, title: "Tears as Currency", keywords: ["vending machine", "tears", "currency", "deadpan surrealism", "cyan"], category: "Graphic / Illustration / Print", moodTags: ["deadpan", "surreal", "graphic"] },
  { index: 43, title: "Grief in Transit", keywords: ["airplane", "floating machine", "coral sun", "technical collage", "flight"], category: "Mixed Media / Collage", moodTags: ["weightless", "mechanical", "graphic"] },
  { index: 44, title: "Folded Machine", keywords: ["collapsed machine", "crumpled structure", "red core", "object study", "paper texture"], category: "Material / Sculptural / Organic", moodTags: ["compressed", "tactile", "strange"] },
  { index: 47, title: "Tempest Teacup", keywords: ["teacup", "thundercloud", "storm", "surreal still life", "ink wash"], category: "Surreal / Hybrid", moodTags: ["volatile", "delicate", "poetic"] },
  { index: 48, title: "Escalator to Nowhere", keywords: ["broken escalator", "empty architecture", "coral steps", "industrial", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["liminal", "architectural", "stark"] },
  { index: 56, title: "Cassette Veins", keywords: ["cassette tape", "unspooling ribbon", "branching roots", "analog object", "surreal print"], category: "Graphic / Illustration / Print", moodTags: ["analog", "rooted", "electric"] },
  { index: 57, title: "Camera Tears", keywords: ["surveillance camera", "dripping ink", "machine", "cyan", "surreal object"], category: "Graphic / Illustration / Print", moodTags: ["watchful", "melancholic", "graphic"] },
  { index: 61, title: "Door on a Plate", keywords: ["plate", "tiny door", "island", "object surrealism", "circular composition"], category: "Surreal / Hybrid", moodTags: ["contained", "mysterious", "playful"] },
  { index: 64, title: "Suitcase Forecast", keywords: ["suitcase", "rain cloud", "travel object", "ink illustration", "coral accent"], category: "Graphic / Illustration / Print", moodTags: ["portable", "weathered", "wry"] },
  { index: 65, title: "Parking Meter Garden", keywords: ["parking meter", "plants", "urban object", "geometric circles", "surreal print"], category: "Graphic / Illustration / Print", moodTags: ["urban", "organic", "precise"] },
  { index: 73, title: "Ocean in the Bath", keywords: ["bathtub", "ocean waves", "key", "black water", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["tidal", "contained", "dreamlike"] },
  { index: 75, title: "Birthday Spark", keywords: ["single candle", "water surface", "flame", "dark field", "surreal minimalism"], category: "Minimal / Abstract", moodTags: ["luminous", "fragile", "quiet"] },
  { index: 78, title: "Family Circuit", keywords: ["telephone cord", "branching network", "abstract linework", "coral nodes", "ink collage"], category: "Minimal / Abstract", moodTags: ["connected", "kinetic", "organic"] },
  { index: 85, title: "Celestial Paper Bag", keywords: ["paper bag", "glowing stars", "rocky debris", "cosmic night", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["cosmic", "poignant", "still"] },
  { index: 86, title: "Mattress Island", keywords: ["floating mattress", "dark pool", "empty object", "isolation", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["adrift", "quiet", "uncanny"] },
  { index: 88, title: "Microwave Bloom", keywords: ["microwave", "bursting flowers", "domestic object", "surreal flame", "cyan wall"], category: "Surreal / Hybrid", moodTags: ["domestic", "volatile", "inventive"] },
  { index: 89, title: "Sleeping Cart", keywords: ["grocery cart", "smoldering contents", "night", "object study", "surreal scene"], category: "Surreal / Hybrid", moodTags: ["abandoned", "ember-lit", "strange"] },
  { index: 91, title: "Storm in a Fishbowl", keywords: ["fishbowl", "storm", "goldfish", "umbrella", "engraving"], category: "Surreal / Hybrid", moodTags: ["stormy", "delicate", "whimsical"] },
  { index: 93, title: "Buried Clocks", keywords: ["spoon", "clock faces", "soup bowl", "time", "surreal object"], category: "Surreal / Hybrid", moodTags: ["temporal", "tactile", "uncanny"] },
  { index: 94, title: "Reverse Rain", keywords: ["black umbrella", "upward rain", "coral cloud", "graphic collage", "weather"], category: "Graphic / Illustration / Print", moodTags: ["inverted", "graphic", "stormy"] },
  { index: 97, title: "Burned Prophecy", keywords: ["toaster", "burning bread", "domestic object", "blue wall", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["domestic", "smoldering", "wry"] },
  { index: 99, title: "Paper Moon", keywords: ["moon", "paper bands", "cloud", "lunar collage", "cream field"], category: "Mixed Media / Collage", moodTags: ["lunar", "layered", "quiet"] },
  { index: 104, title: "Red Thread", keywords: ["red thread", "fortune cookie", "cloudscape", "minimal landscape", "surreal symbol"], category: "Minimal / Abstract", moodTags: ["symbolic", "airy", "precise"] },
  { index: 105, title: "Mirror Box", keywords: ["shipping box", "mirror interior", "clouds", "contained sky", "surreal object"], category: "Surreal / Hybrid", moodTags: ["reflective", "contained", "dreamlike"] },
  { index: 106, title: "Unopened Staircase", keywords: ["stone staircase", "blue wall", "coral light", "architectural fragment", "liminal"], category: "Graphic / Illustration / Print", moodTags: ["ascending", "architectural", "enigmatic"] },
  { index: 108, title: "Clockwork Orchard", keywords: ["time clock", "blossoming branches", "machine", "coral flowers", "surreal object"], category: "Surreal / Hybrid", moodTags: ["mechanical", "blooming", "precise"] },
  { index: 109, title: "End of Takeout", keywords: ["takeout box", "open container", "red interior", "minimal shadow", "surreal still life"], category: "Minimal / Abstract", moodTags: ["spare", "final", "warm"] },
  { index: 113, title: "Staircase Soup", keywords: ["soup bowl", "staircase", "steam", "cyan and coral", "surreal object"], category: "Surreal / Hybrid", moodTags: ["ascending", "warm", "inventive"] },
  { index: 115, title: "Pinned Cloud", keywords: ["cloud", "chopstick", "red field", "minimal surrealism", "graphic sky"], category: "Graphic / Illustration / Print", moodTags: ["airy", "impossible", "minimal"] },
  { index: 119, title: "Days Almost Here", keywords: ["empty chair", "red suns", "forest edge", "calendar metaphor", "graphic landscape"], category: "Graphic / Illustration / Print", moodTags: ["anticipatory", "quiet", "symbolic"] },
  { index: 122, title: "Second Sunrise", keywords: ["sunrise", "barcode", "architectural silhouette", "coral horizon", "graphic collage"], category: "Mixed Media / Collage", moodTags: ["luminous", "graphic", "renewed"] },
  { index: 139, title: "Mechanical Bird Nest", keywords: ["mechanical bird", "typewriter", "nest", "cyan and coral", "surreal machine"], category: "Graphic / Illustration / Print", moodTags: ["mechanical", "tender", "precise"] },
  { index: 152, title: "City in the Broth", keywords: ["city", "noodle bowl", "miniature world", "food surrealism", "print"], category: "Graphic / Illustration / Print", moodTags: ["urban", "absurd", "playful"] },
  { index: 153, title: "Barcode Moon", keywords: ["moon", "barcode", "lunar", "distressed collage", "black"], category: "Mixed Media / Collage", moodTags: ["lunar", "distressed", "enigmatic"] },
  { index: 159, title: "Weather Under the Umbrella", keywords: ["black umbrella", "smoke cloud", "storm", "graphic print", "coral"], category: "Graphic / Illustration / Print", moodTags: ["volatile", "graphic", "brooding"] },
  { index: 161, title: "Ramen Orbit", keywords: ["ramen", "vinyl record", "chopsticks", "food surrealism", "retro print"], category: "Graphic / Illustration / Print", moodTags: ["retro", "playful", "cosmic"] },
  { index: 162, title: "Coral Beak", keywords: ["toucan", "coral circle", "bird portrait", "print texture", "graphic animal"], category: "Graphic / Illustration / Print", moodTags: ["avian", "bold", "graphic"] },
  { index: 164, title: "Key to the Threshold", keywords: ["door handle", "hanging key", "architectural detail", "coral circle", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["symbolic", "architectural", "precise"] },
  { index: 165, title: "Mechanical Hand Bloom", keywords: ["mechanical hand", "botanical forms", "technical drawing", "pink circles", "collage"], category: "Mixed Media / Collage", moodTags: ["mechanical", "botanical", "intricate"] },
  { index: 166, title: "Tempest in Porcelain", keywords: ["teacup", "storm tree", "lightning", "porcelain", "surreal print"], category: "Surreal / Hybrid", moodTags: ["electric", "delicate", "organic"] },
  { index: 174, title: "Island Plate", keywords: ["island", "plate", "miniature architecture", "circular composition", "coral cloud"], category: "Surreal / Hybrid", moodTags: ["contained", "architectural", "dreamlike"] },
  { index: 178, title: "Mechanical Saint", keywords: ["cybernetic figure", "mechanical form", "halo", "technical collage", "red"], category: "Mixed Media / Collage", moodTags: ["mechanical", "mythic", "precise"], reviewFlags: ["generic-robot-form-review"] },
  { index: 13, title: "Melted Signal", keywords: ["smoke detector", "melted object", "coral accent", "ink wash", "surreal machine"], category: "Surreal / Hybrid", moodTags: ["melted", "mechanical", "expressive"] },
  { index: 19, title: "Honest Machine", keywords: ["coffee machine", "single cup", "industrial object", "cyan", "graphic illustration"], category: "Graphic / Illustration / Print", moodTags: ["functional", "precise", "wry"] },
  { index: 24, title: "Cold Cabinet", keywords: ["open refrigerator", "shelves", "domestic object", "cyan interior", "surreal still life"], category: "Surreal / Hybrid", moodTags: ["domestic", "cool", "uncanny"] },
  { index: 30, title: "City Reflection Bowl", keywords: ["bowl", "city skyline", "water reflection", "miniature landscape", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["urban", "reflective", "contained"] },
  { index: 34, title: "Fragile Emotions", keywords: ["fragmented paper", "broken form", "coral shard", "abstract collage", "ink texture"], category: "Mixed Media / Collage", moodTags: ["fragmented", "tactile", "expressive"] },
  { index: 62, title: "Courtroom Cake", keywords: ["layer cake", "architectural interior", "cutaway object", "surreal pastry", "graphic print"], category: "Surreal / Hybrid", moodTags: ["layered", "architectural", "absurd"] },
  { index: 70, title: "Cereal Archive", keywords: ["open cereal box", "miniature landscape", "domestic object", "ink drawing", "surreal packaging"], category: "Graphic / Illustration / Print", moodTags: ["domestic", "miniature", "wry"] },
  { index: 83, title: "Mailbox Garden", keywords: ["mailbox", "flowers", "outdoor object", "coral and cyan", "surreal illustration"], category: "Graphic / Illustration / Print", moodTags: ["botanical", "nostalgic", "quiet"] },
  { index: 102, title: "Black Coffee Fountain", keywords: ["fountain", "black coffee", "coral spill", "circular basin", "surreal landscape"], category: "Surreal / Hybrid", moodTags: ["flowing", "graphic", "strange"] },
  { index: 112, title: "Unsaid Things", keywords: ["red telephone", "speech bubbles", "graphic object", "cream field", "communication"], category: "Graphic / Illustration / Print", moodTags: ["silent", "graphic", "wry"] },
  { index: 183, title: "Payphone for Forgiveness", keywords: ["payphone", "empty wall", "coral and cyan", "urban object", "graphic print"], category: "Graphic / Illustration / Print", moodTags: ["urban", "solitary", "symbolic"] },
  { index: 185, title: "Tower of Smoke", keywords: ["smoke tower", "blue sky", "coral ground", "vertical landscape", "surreal print"], category: "Graphic / Illustration / Print", moodTags: ["vertical", "atmospheric", "graphic"] },
];

const curationRoot = process.env.ARTCOVR_CURATION_ROOT
  ? path.resolve(process.env.ARTCOVR_CURATION_ROOT)
  : "E:\\ART_COLLECTION\\.artcovr-curation";
const auditPath = path.join(curationRoot, "concept-square1024-audit.json");
const outputPath = path.join(curationRoot, "concept-reference-shortlist.json");
const audit = JSON.parse(await readFile(auditPath, "utf8")) as AuditRecord[];
const selectedIndices = new Set(CONCEPT_SPECS.map(({ index }) => index));
if (CONCEPT_SPECS.length !== 66 || selectedIndices.size !== 66) {
  throw new Error("Expanded concept shortlist must contain exactly 66 unique indices.");
}

const shortlist = CONCEPT_SPECS.map((spec, position) => {
  const source = audit[spec.index - 1];
  if (!source || source.width !== source.height || source.width < 1024) {
    throw new Error(`Concept Q${spec.index} failed its exact square audit join.`);
  }
  return {
    rank: position + 1,
    audit_index: spec.index,
    path: source.path,
    filename: source.filename,
    title: spec.title,
    prompt: null,
    keywords: spec.keywords,
    palette_hex: [],
    width: source.width,
    height: source.height,
    bytes: source.size_bytes,
    format: source.format,
    sha256: source.sha256,
    metadata_linkage: {
      join: "exact audit index, path, and SHA-256",
      source: source.source,
      classification: source.classification,
      title_source: "curator visual review",
      keyword_source: "curator visual review of the exact SHA-locked image",
      prompt_source: "unavailable; not reconstructed",
    },
    confidence: {
      identity_dimensions_hash: "high",
      title_keywords: "high",
      prompt: "unavailable",
      rights: "unverified",
    },
    rights_flags: [
      "commercial_rights_unconfirmed",
      "owner_approval_required",
      "no_obvious_logo_text_watermark_likeness_or_protected_character_in_visual_review",
      ...(spec.reviewFlags ?? []),
    ],
    category: spec.category,
    moodTags: spec.moodTags,
  };
});

await writeFile(
  outputPath,
  `${JSON.stringify({
    pool: "concept_reference_art",
    audit_basis: {
      source_root: "E:\\ART_COLLECTION\\concept_reference_art",
      square_rule: "decoded width == height and width >= 1024",
      selected_count: shortlist.length,
      shortlist_exact_duplicates: shortlist.length - new Set(shortlist.map(({ sha256 }) => sha256)).size,
      metadata_catalog: "E:\\ART_COLLECTION\\00_catalog\\master_manifest_with_prompts.csv",
      prompt_note: "Trusted source metadata contains no prompts for these records; prompt remains null rather than being inferred from the image.",
      rights_note: "Visual review is not commercial-rights clearance. Every item remains blocked pending owner approval.",
    },
    shortlist,
  }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ outputPath, selected: shortlist.length }, null, 2));

import { writeFile } from "node:fs/promises";
import { EXCLUDED_LAUNCH_SOURCE_HASHES, RETIRED_GENERATED_SOURCE_ORDINALS } from "../../../src/lib/artcovr/catalog-review.ts";
import { REGENERATION_REQUIRED_SOURCE_HASHES } from "../../../src/lib/artcovr/source-exclusions.ts";
import { launchSelection } from "../../../src/lib/artcovr/launch-selection.ts";
const live = launchSelection.map((s) => s.sourceSha256).filter(Boolean);
await writeFile("E:\\ART_COLLECTION\\.artcovr-scoring\\blocklist.json", JSON.stringify({
  excluded: [...EXCLUDED_LAUNCH_SOURCE_HASHES],
  regenRequired: [...REGENERATION_REQUIRED_SOURCE_HASHES],
  retiredOrdinals: [...RETIRED_GENERATED_SOURCE_ORDINALS],
  liveSelectionHashes: live,
}, null, 1), "utf8");
console.log("excluded", EXCLUDED_LAUNCH_SOURCE_HASHES.size, "regenRequired", REGENERATION_REQUIRED_SOURCE_HASHES.size,
            "retiredOrdinals", RETIRED_GENERATED_SOURCE_ORDINALS.size, "liveHashes", live.length);

/**
 * Drift check for the committed src/lib/artcovr/search-index.json: rebuilds
 * the index in memory from the semantic-lab source artifacts and fails if the
 * committed file differs by even one byte. Same pattern as
 * `catalog:project:check` (scripts/catalog/project-approved-catalog.ts
 * --check) — run this instead of trusting that the JSON on disk still
 * matches its inputs.
 */
import { readFile } from "node:fs/promises";

import {
  buildSearchIndex,
  SEARCH_INDEX_OUTPUT_PATH,
  SEMANTIC_LAB_DIR,
  semanticLabAvailable,
} from "./build-search-index.ts";

// Fail closed, but say which failure this is: an absent private lab reads as a
// stale index otherwise, and the ENOENT names a path that means nothing off the
// owner's machine. This gate stays owner/CI-with-lab only by design — see
// `verify:ci` in package.json for the portable gate set.
if (!semanticLabAvailable()) {
  throw new Error(
    `Cannot verify the search index: the private semantic-lab source tree is not present at ${SEMANTIC_LAB_DIR}. ` +
      "Set ARTCOVR_SEMANTIC_LAB_DIR to its location, or run the portable gate set with 'bun run verify:ci'.",
  );
}

const { serialized } = await buildSearchIndex();

let current: string;
try {
  current = await readFile(SEARCH_INDEX_OUTPUT_PATH, "utf8");
} catch (error) {
  throw new Error(
    `Cannot read committed search index at ${SEARCH_INDEX_OUTPUT_PATH}. Run 'bun run catalog:search:build' first.`,
    { cause: error },
  );
}

const normalize = (value: string) => value.replace(/\r\n/g, "\n");
if (normalize(current) !== normalize(serialized)) {
  throw new Error(
    `${SEARCH_INDEX_OUTPUT_PATH} is stale relative to the semantic-lab source artifacts. ` +
      "Run 'bun run catalog:search:build' and commit the result.",
  );
}

console.log(
  JSON.stringify(
    {
      outputPath: SEARCH_INDEX_OUTPUT_PATH,
      status: "up-to-date",
    },
    null,
    2,
  ),
);

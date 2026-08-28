/**
 * Drift check for the committed src/lib/artcovr/search-index.json: rebuilds
 * the index in memory from the semantic-lab source artifacts and fails if the
 * committed file differs by even one byte. Same pattern as
 * `catalog:project:check` (scripts/catalog/project-approved-catalog.ts
 * --check) — run this instead of trusting that the JSON on disk still
 * matches its inputs.
 */
import { readFile } from "node:fs/promises";

import { buildSearchIndex, SEARCH_INDEX_OUTPUT_PATH } from "./build-search-index.ts";

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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectPublicCatalog } from "../../src/lib/artcovr/catalog-visibility.ts";

test("public catalog excludes every unapproved or unpublished review item", () => {
  const items = [
    { id: "ready", rightsApproved: true, published: true },
    { id: "rights-pending", rightsApproved: false, published: true },
    { id: "publication-pending", rightsApproved: true, published: false },
  ];
  assert.deepEqual(selectPublicCatalog(items).map((item) => item.id), ["ready"]);
});

test("private staging requires the explicit review-build flag", async () => {
  const source = await readFile(
    new URL("../../src/lib/artcovr/artworks.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1"/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING !== "0"/);
});

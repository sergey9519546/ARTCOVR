import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { commitCatalogBatch } from "../../src/lib/artcovr/catalog-batch-transaction.ts";

test("catalog batch transaction replaces manifests and adds protected assets together", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "artcovr-catalog-transaction-"));
  try {
    const approved = path.join(directory, "approved.json");
    const overrides = path.join(directory, "overrides.json");
    const assetSource = path.join(directory, "protected-source.jpg");
    const assetTarget = path.join(directory, "published.jpg");
    await Promise.all([
      writeFile(approved, "old-approved"),
      writeFile(overrides, "old-overrides"),
      writeFile(assetSource, "protected-bytes"),
    ]);

    await commitCatalogBatch({
      replacements: [
        { target: approved, contents: "new-approved" },
        { target: overrides, contents: "new-overrides" },
      ],
      assets: [{ source: assetSource, target: assetTarget }],
      transactionId: "success",
    });

    assert.equal(await readFile(approved, "utf8"), "new-approved");
    assert.equal(await readFile(overrides, "utf8"), "new-overrides");
    assert.equal(await readFile(assetTarget, "utf8"), "protected-bytes");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("catalog batch transaction refuses to overwrite an existing protected asset", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "artcovr-catalog-transaction-"));
  try {
    const approved = path.join(directory, "approved.json");
    const assetSource = path.join(directory, "protected-source.jpg");
    const assetTarget = path.join(directory, "published.jpg");
    await Promise.all([
      writeFile(approved, "old-approved"),
      writeFile(assetSource, "protected-bytes"),
      writeFile(assetTarget, "existing-publication"),
    ]);

    await assert.rejects(
      commitCatalogBatch({
        replacements: [{ target: approved, contents: "new-approved" }],
        assets: [{ source: assetSource, target: assetTarget }],
        transactionId: "collision",
      }),
      /Refusing to overwrite protected display/,
    );
    assert.equal(await readFile(approved, "utf8"), "old-approved");
    assert.equal(await readFile(assetTarget, "utf8"), "existing-publication");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

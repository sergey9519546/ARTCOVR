import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionSchemaReady, migrationHistoryQuery } from "./schemaReadiness";

const manifest = [
  { hash: "a".repeat(64), createdAt: 1000 },
  { hash: "b".repeat(64), createdAt: 2000 },
];
const applied = manifest.map(({ hash }, index) => ({
  hash,
  created_at: String(9000 + index),
}));

test("production accepts the exact applied migration history using only a read query", async () => {
  const queries: string[] = [];
  await assertProductionSchemaReady("production", manifest, async (query) => {
    queries.push(query);
    return { rows: applied };
  });
  assert.deepEqual(queries, [migrationHistoryQuery]);
  assert.match(migrationHistoryQuery, /^select /);
});

test("production ignores application timestamps because journal times describe generation", async () => {
  await assertProductionSchemaReady("production", manifest, async () => ({
    rows: manifest.map(({ hash }, index) => ({ hash, created_at: 7000 + index })),
  }));
});

test("old and fresh databases cannot start the production API", async () => {
  for (const rows of [[], applied.slice(0, 1)]) {
    await assert.rejects(assertProductionSchemaReady("production", manifest, async () => ({ rows })), /applied migrations do not match/);
  }
});

test("missing or unreadable history fails closed without exposing database errors", async () => {
  await assert.rejects(assertProductionSchemaReady("production", manifest, async () => {
    throw new Error("connection secret must never be logged here");
  }), (error: Error) => {
    assert.match(error.message, /migration history is unavailable/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});

test("wrong hashes, order, extra and malformed rows fail closed", async () => {
  for (const rows of [
    [...applied].reverse(), [...applied, applied[1]],
    [applied[0], { ...applied[1], hash: "c".repeat(64) }],
    [applied[0], null], [applied[0], {}],
  ]) {
    await assert.rejects(assertProductionSchemaReady("production", manifest, async () => ({ rows })), /applied migrations do not match/);
  }
});

test("missing or malformed build manifests fail before querying", async () => {
  for (const value of [undefined, null, [], {}, [null], [{ hash: "bad", createdAt: 1 }],
    [{ ...manifest[0], createdAt: NaN }], [...manifest].reverse(), [manifest[0], { ...manifest[1], hash: manifest[0].hash }]]) {
    let queried = false;
    await assert.rejects(assertProductionSchemaReady("production", value, async () => {
      queried = true;
      return { rows: applied };
    }), /manifest is missing or invalid/);
    assert.equal(queried, false);
  }
});

test("development and test startup do not require a manifest or query history", async () => {
  for (const nodeEnv of [undefined, "development", "test"]) {
    await assertProductionSchemaReady(nodeEnv, undefined, async () => {
      assert.fail("development must not query migration history");
    });
  }
});

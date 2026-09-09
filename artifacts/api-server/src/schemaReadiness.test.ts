import assert from "node:assert/strict";
import test from "node:test";
import { assertProductionSchemaReady, migrationHistoryQuery } from "./schemaReadiness";

const manifest = [
  { hash: "a".repeat(64), createdAt: 1000 },
  { hash: "b".repeat(64), createdAt: 2000 },
];
const applied = manifest.map((_migration, index) => ({
  id: String(index + 1),
  build_id: `build-${index + 1}`,
  deployment_id: "deployment-1",
  statement_count: String(index + 4),
  applied_at: new Date(9000 + index),
}));

test("production accepts Replit managed migration history using only a read query", async () => {
  const queries: string[] = [];
  await assertProductionSchemaReady("production", manifest, async (query) => {
    queries.push(query);
    return { rows: applied };
  });
  assert.deepEqual(queries, [migrationHistoryQuery]);
  assert.match(migrationHistoryQuery, /^select /);
});

test("production accepts managed records regardless of their application timestamps", async () => {
  await assertProductionSchemaReady("production", manifest, async () => ({
    rows: applied.map((record, index) => ({
      ...record,
      applied_at: `2026-09-08T10:0${index}:00.000Z`,
    })),
  }));
});

test("databases without managed migration history cannot start the production API", async () => {
  for (const rows of [[], [{ ...applied[0], build_id: "" }]]) {
    await assert.rejects(
      assertProductionSchemaReady("production", manifest, async () => ({ rows })),
      /managed migration history is missing or invalid/,
    );
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

test("malformed managed records fail closed", async () => {
  for (const rows of [
    [applied[0], { ...applied[1], statement_count: "-1" }],
    [applied[0], null],
    [applied[0], {}],
  ]) {
    await assert.rejects(
      assertProductionSchemaReady("production", manifest, async () => ({ rows })),
      /managed migration history is missing or invalid/,
    );
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

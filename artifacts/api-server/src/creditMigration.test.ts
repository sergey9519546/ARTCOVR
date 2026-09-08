import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pool } from "@workspace/db";

const baseline = await readFile(new URL("../../../lib/db/drizzle/0000_known_the_leader.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../../../lib/db/drizzle/0001_stiff_iron_lad.sql", import.meta.url), "utf8");

// A transaction-local private schema tests upgrade paths without touching the
// application's tables. The enclosing test database must still be disposable.
test("credit migration preserves historical consumption and is safe to reapply", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schema = `credit_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(baseline);
    await client.query(`INSERT INTO artcovr_orders
      (id, clerk_user_id, artwork_id, artwork_slug, idempotency_key, amount_cents, sale_mode, license_terms, included_credits, status, paid_at)
      VALUES ('purchase', 'owner', 'art', 'art', 'purchase', 3500, 'repeatable', 'test', 4, 'paid', now()),
      ('guest-purchase', NULL, 'art', 'art', 'guest-purchase', 3500, 'repeatable', 'test', 4, 'paid', now());
      INSERT INTO artcovr_credit_ledger (id, account_key, order_id, entry_type, amount, reason, source_id)
      VALUES ('grant', 'owner', 'purchase', 'grant', 4, 'test', 'grant'),
      ('guest-grant', 'customer@example.test', 'guest-purchase', 'grant', 4, 'test', 'guest-grant');
      INSERT INTO artcovr_generations (id, clerk_user_id, artwork_id, purchase_id, phase, status, prompt, source_object_key, expires_at)
      VALUES ('success', 'owner', 'art', 'purchase', 'purchased', 'succeeded', 'test', 'private', now()),
      ('running', 'owner', 'art', 'purchase', 'purchased', 'running', 'test', 'private', now()),
      ('failed', 'owner', 'art', 'purchase', 'purchased', 'failed', 'test', 'private', now()),
      ('preview', 'owner', 'art', NULL, 'preview', 'succeeded', 'test', 'private', now());`);
    await client.query(migration);
    await client.query(migration);
    const balance = await client.query("SELECT sum(amount)::integer AS balance FROM artcovr_credit_ledger WHERE order_id = 'purchase'");
    assert.equal(balance.rows[0].balance, 2);
    const owner = await client.query("SELECT clerk_user_id FROM artcovr_credit_ledger WHERE id = 'guest-grant'");
    assert.equal(owner.rows[0].clerk_user_id, "guest:guest-purchase");
    const count = await client.query("SELECT count(*)::integer AS count FROM artcovr_credit_ledger WHERE entry_type = 'spend'");
    assert.equal(count.rows[0].count, 2);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

test("credit migration fails closed on orphan ledger rows", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const schema = `credit_migration_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(baseline);
    await client.query("INSERT INTO artcovr_credit_ledger (id, account_key, entry_type, amount, reason, source_id) VALUES ('orphan', 'unknown', 'grant', 4, 'test', 'orphan')");
    await assert.rejects(client.query(migration), /orphan or conflicting ledger ownership/);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

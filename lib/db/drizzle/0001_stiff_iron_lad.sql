-- Owner-approved maintenance release only: stop/drain the old API and generation
-- workers before applying. Drizzle runs this migration in a transaction.
-- Never infer an owner from email/account_key or silently discard orphan money.
LOCK TABLE "artcovr_orders", "artcovr_generations", "artcovr_credit_ledger" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
ALTER TABLE "artcovr_credit_ledger" ADD COLUMN IF NOT EXISTS "clerk_user_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM artcovr_credit_ledger l LEFT JOIN artcovr_orders o ON o.id = l.order_id
    WHERE o.id IS NULL OR (l.clerk_user_id IS NOT NULL AND
      l.clerk_user_id <> coalesce(o.clerk_user_id, 'guest:' || o.id))
  ) THEN
    RAISE EXCEPTION 'Credit migration blocked: orphan or conflicting ledger ownership needs reconciliation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM artcovr_generations g LEFT JOIN artcovr_orders o ON o.id = g.purchase_id
    WHERE g.purchase_id IS NOT NULL AND g.status IN ('queued', 'running', 'succeeded')
      AND (o.id IS NULL OR g.clerk_user_id IS DISTINCT FROM o.clerk_user_id)
  ) THEN
    RAISE EXCEPTION 'Credit migration blocked: purchased generation ownership needs reconciliation';
  END IF;
END $$;
--> statement-breakpoint
UPDATE artcovr_credit_ledger l
SET clerk_user_id = coalesce(o.clerk_user_id, 'guest:' || o.id)
FROM artcovr_orders o WHERE o.id = l.order_id AND l.clerk_user_id IS NULL;
--> statement-breakpoint
-- Before ledger-based admission, allowance_slot accounted for these spends.
-- Preserve successful and in-flight consumption; failed previews never spend.
INSERT INTO artcovr_credit_ledger
  (id, clerk_user_id, account_key, order_id, entry_type, amount, reason, source_id, created_at)
SELECT 'credit_migration_spend_' || g.id, g.clerk_user_id, g.clerk_user_id,
  g.purchase_id, 'spend', -1, 'Historical purchased generation credit spend',
  'generation:' || g.id || ':spend', g.created_at
FROM artcovr_generations g
WHERE g.purchase_id IS NOT NULL AND g.status IN ('queued', 'running', 'succeeded')
ON CONFLICT (source_id) DO NOTHING;
--> statement-breakpoint
ALTER TABLE "artcovr_credit_ledger" ALTER COLUMN "order_id" SET NOT NULL;
ALTER TABLE "artcovr_credit_ledger" ALTER COLUMN "clerk_user_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artcovr_credit_ledger_clerk_user_id_idx" ON "artcovr_credit_ledger" USING btree ("clerk_user_id");
CREATE INDEX IF NOT EXISTS "artcovr_credit_ledger_order_id_idx" ON "artcovr_credit_ledger" USING btree ("order_id");

---
name: Stripe catalog cleanup limits
description: Operational constraints for safely auditing and consolidating ARTCOVR Stripe catalog duplicates
---

Stripe catalog audits must read each product's price pages sequentially through the Replit Stripe proxy rather than issuing one request per product in parallel.

**Why:** The proxy enforces a low per-Repl request rate; parallel price reads can fail a read-only audit with HTTP 429 before the report is produced.

**How to apply:** Keep cleanup dry-run by default, inspect historical orders, sessions, payment links, and default-price references before any mutation, and require the exact destructive confirmation token for deactivation.

Confirmed catalog cleanup is resumable: each mutation has a stable idempotency key, progress is checkpointed after successful responses, and retries begin from a fresh audit.

**Why:** A timed-out wrapper does not prove which sequential Stripe mutations completed; active/default-price state is the durable checkpoint available to a stateless CLI.

**How to apply:** Bound long runs with the CLI mutation limit, record the last completed category/object, and rerun the confirmed cleanup; inactive prices/products and cleared defaults are excluded by the fresh audit.

The Stripe order reconciliation audit belongs in the release gate rather than the portable CI gate.

**Why:** It reads the connected Stripe account and the live order database, so it cannot run reliably in pull-request environments while still providing a release-time operator signal.

**How to apply:** Keep the reconciliation command read-only and run it explicitly as part of release verification; stale test-mode records warn, while unresolved live references fail.
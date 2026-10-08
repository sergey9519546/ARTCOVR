---
name: Clerk privacy smoke isolation
description: Database isolation and recovery-safe fixture cleanup for the Clerk privacy verifier
---

The Clerk privacy verifier must create its own disposable loopback PostgreSQL database, migrate only that database, and pass only its local `DATABASE_URL` to the API and smoke subprocesses. Reject configured API targets. Build the API first and spawn its Node process directly; do not supervise it through a nested `pnpm dev` process. Fixture cleanup must use run-specific IDs and retain order/ledger parent rows until generation objects and generation records are confirmed clean.

**Why:** The user requires this check to remain isolated even when a development database URL is inherited, and prior cleanup failures must not cascade-delete recovery references or expose unverified customer data. A real run also showed that terminating a `pnpm dev` supervisor can leave the API child alive, causing a database error during cluster shutdown.

**How to apply:** Preserve these boundaries when changing the verifier, migrations, or development smoke cleanup. Do not run its schema or tests against an inherited database; perform final full-suite/completion validation only after the user confirms the source patches are applied.

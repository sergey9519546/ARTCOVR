---
name: Clerk privacy smoke isolation
description: Database isolation and recovery-safe fixture cleanup for the Clerk privacy verifier
---

The Clerk privacy verifier must create its own disposable loopback PostgreSQL database, migrate only that database, and pass only its local `DATABASE_URL` to the API and smoke subprocesses. Reject configured API targets. Fixture cleanup must use run-specific IDs and retain order/ledger parent rows until generation objects and generation records are confirmed clean.

**Why:** The user requires this check to remain isolated even when a development database URL is inherited, and prior cleanup failures must not cascade-delete recovery references or expose unverified customer data.

**How to apply:** Preserve these boundaries when changing the verifier, migrations, or development smoke cleanup. Do not run its schema or tests against an inherited database; perform final full-suite/completion validation only after the user confirms the source patches are applied.

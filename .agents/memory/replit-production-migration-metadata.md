---
name: Replit production migration metadata
description: Production schema readiness must use Replit's managed migration audit, not Drizzle's development history table.
---

Replit-managed production databases record publish-time schema operations in `_system.replit_database_migrations_v1`; the Drizzle `drizzle.__drizzle_migrations` table is a development-database detail and is not guaranteed to exist in production.

**Why:** Querying the Drizzle table in the API entrypoint caused the process to exit before binding its port, even though the published production schema and application tables were current.

**How to apply:** Treat the Publish flow and its managed audit records as the production schema authority. Runtime checks may fail closed when the managed audit is missing or malformed, but must never run production DDL or require development-only migration hashes.
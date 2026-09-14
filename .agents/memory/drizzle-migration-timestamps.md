---
name: Drizzle migration timestamps
description: Distinguishes migration journal generation times from applied database timestamps
---

Drizzle migration readiness checks must use the ordered migration hashes as identity. The journal's `when` value records when a migration was generated, while `drizzle.__drizzle_migrations.created_at` records when it was applied; those timestamps are expected to differ.

**Why:** Requiring timestamp equality blocked a healthy API before it opened its port and caused publish promotion to fail even though the schema was current.

**How to apply:** Validate the manifest's timestamps only for internal ordering, then compare applied rows by ordered hash and count. Keep the readiness check read-only.

Do not edit an already-applied migration, including comments used by verification tooling. If a development database has a schema-equivalent hash mismatch caused by an older comment-only migration edit, reconcile only the development migration marker through the controlled database workflow; never weaken the hash check or alter production history.

**Why:** A verifier marker added to the first migration changed its file hash after development had already applied the DDL, causing a false drift failure even though the schema was correct.

**How to apply:** Treat committed migration SQL as immutable after application. Add new migrations for schema changes, and handle historical development metadata mismatches explicitly rather than accepting arbitrary legacy hashes.
---
name: Drizzle migration timestamps
description: Distinguishes migration journal generation times from applied database timestamps
---

Drizzle migration readiness checks must use the ordered migration hashes as identity. The journal's `when` value records when a migration was generated, while `drizzle.__drizzle_migrations.created_at` records when it was applied; those timestamps are expected to differ.

**Why:** Requiring timestamp equality blocked a healthy API before it opened its port and caused publish promotion to fail even though the schema was current.

**How to apply:** Validate the manifest's timestamps only for internal ordering, then compare applied rows by ordered hash and count. Keep the readiness check read-only.
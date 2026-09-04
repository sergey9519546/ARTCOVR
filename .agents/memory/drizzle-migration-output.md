---
name: Drizzle migration output
description: Workspace-specific Drizzle Kit behavior when generating and rereading migration metadata
---

Drizzle Kit should use a package-relative migration output such as `./drizzle` in the database package config. An absolute output path can generate the first migration successfully but fail on a later generation when the existing snapshot is reread.

**Why:** The workspace package runner changes the effective path context used by Drizzle Kit's migration-folder validation; relative output is stable across initial and repeat generation.

**How to apply:** Keep committed SQL migrations, `_journal.json`, and snapshots together under the database package, and run generation twice in validation when changing the config.
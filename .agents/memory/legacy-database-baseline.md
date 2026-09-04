---
name: Legacy database baseline
description: Safe adoption rule for databases created before versioned Drizzle migrations
---

Only baseline an existing database when it is explicitly identified as development
and its live commerce catalog matches the first committed migration. Fresh databases
must run the migration normally, while partial or mismatched schemas must stop.

**Why:** Marking an incomplete legacy schema as migrated hides real drift, and replaying
the first migration against an old push-created schema can fail on existing tables.

**How to apply:** Compare against temporary objects built from the committed first
migration, ignore harmless column-order and schema-qualification differences, and
record only the standard Drizzle history marker in a transaction.
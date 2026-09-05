---
name: Stripe environment account checks
description: Verify Stripe account identity and exact session metadata before diagnosing reconciliation failures
---

Do not infer Stripe account ownership from the environment label or from a session ID prefix alone; verify the connected account ID, livemode, and session client reference metadata.

**Why:** Development and production connector records can resolve to the same live account, while production data may still contain intentionally stale test-mode checkout references.

**How to apply:** For a reconciliation alert, compare each production order's stored session with the connected account's exact session and treat unmatched `cs_test_` records as stale test data only when the account is confirmed live.
---
name: Credit ledger lifecycle
description: Purchase-scoped credit accounting for image edits, including guest claims and deterministic release/revoke entries
---

Paid image edits must debit the purchase ledger atomically at admission, then
release that debit exactly once when a queued or running job fails or times out.
Refund and entitlement-loss paths revoke only the remaining positive balance.
Every ledger row has an order ID and an explicit owner marker; a guest grant
uses a temporary purchase-scoped guest principal until verified account claim.
Account history is a sanitized projection: expose only the purchase, artwork
title, event label, signed amount, and timestamp—not ledger reasons, source IDs,
Stripe IDs, prompts, or object keys.

**Why:** Fixed generation counters could not safely reconcile concurrent
requests, provider failures, refunds, guest claims, or multiple purchases owned
by one person.

**How to apply:** Keep ledger source IDs deterministic for generation spend,
release, and purchase revocation. Treat the ledger, scoped by Clerk user and
purchase, as the source of truth for paid generation admission and account
balances; preview allowances remain separate. Any account-facing activity
endpoint must preserve the same owner and purchase scope while projecting
user-readable event labels.

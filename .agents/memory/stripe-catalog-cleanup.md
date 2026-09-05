---
name: Stripe catalog cleanup limits
description: Operational constraints for safely auditing and consolidating ARTCOVR Stripe catalog duplicates
---

Stripe catalog audits must read each product's price pages sequentially through the Replit Stripe proxy rather than issuing one request per product in parallel.

**Why:** The proxy enforces a low per-Repl request rate; parallel price reads can fail a read-only audit with HTTP 429 before the report is produced.

**How to apply:** Keep cleanup dry-run by default, inspect historical orders, sessions, payment links, and default-price references before any mutation, and require the exact destructive confirmation token for deactivation.

Confirmed catalog cleanup can outlive the five-minute shell timeout because default-price clearing, price deactivation, product deactivation, and the post-cleanup audit are sequential Stripe proxy calls.

**Why:** A timed-out wrapper does not prove that the mutation stopped; the connected catalog may already be fully updated.

**How to apply:** After any confirmed cleanup timeout, run a fresh dry-run audit and compare canonical product/price IDs before retrying the command.
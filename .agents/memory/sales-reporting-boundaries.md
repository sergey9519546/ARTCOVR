---
name: Sales reporting boundaries
description: Privacy and timestamp rules for owner sales reporting and storefront funnel data.
---

Owner sales reporting should be built from verified order state, immutable refund events, and the authoritative credit ledger, while storefront funnel events should contain only opaque identifiers, event type, artwork identity, and timestamp. Never use browser success-page state as revenue evidence or include customer, prompt, order, or Stripe identifiers in the report.

**Why:** A sales dashboard is an owner-only aggregate surface, and each metric has a different trustworthy lifecycle timestamp: payment time for paid revenue, refund time for refunds, ledger-entry time for credit movement, and event time for funnel activity.

**How to apply:** Preserve these source and privacy boundaries when adding report filters, exports, comparisons, or new funnel stages. Partial refunds need their own timestamped records; checkout conversion needs a server-linked order cohort; anonymous product views use a server-derived daily dedupe key rather than storing client identity.
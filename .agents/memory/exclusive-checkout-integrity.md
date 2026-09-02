---
name: Exclusive checkout integrity
description: Commerce safety rules for exclusive artwork reservations and late payments
---

An exclusive inventory lock must have the same durable expiry as its payment session. A payment that arrives after inventory was reassigned must be resolved with an idempotent automatic refund and an auditable order outcome, never only suppressed fulfillment.

**Why:** A permanent reservation turns abandoned checkout into an inventory denial of service, while withholding fulfillment after a captured late payment leaves the customer charged and creates a separate commerce-integrity failure.

**How to apply:** Any change to exclusive checkout timing must keep the database reservation deadline and Stripe session expiry aligned. Conflict handling must retry safely across webhook delivery and persist the resulting refund identity and timestamp.
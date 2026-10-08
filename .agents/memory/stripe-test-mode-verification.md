---
name: Stripe test-mode verification
description: Stripe proxy mode has varied across development runs; verify the connection, selected price, and checkout result before test writes.
---

Do not infer Stripe mode from `NODE_ENV=development`, `REPLIT_ENVIRONMENT=development`, or a development connection label. Earlier fresh development checks returned live-mode objects; on 2026-10-08 a fresh development process returned test-mode catalog data, a test-mode standalone-credit price, and a test-mode Checkout Session. That one session was expired and verified unpaid.

**Why:** The proxy's observed mode changed across fresh development checks, so the environment label alone cannot establish which Stripe mode a write would affect.

**How to apply:** Before any Stripe write, confirm the requested runtime expects test mode, freshly verify the proxy mode, and check that the exact selected price has `livemode: false` and matches the intended catalog configuration. Validate the returned Checkout Session's `livemode` too. Abort on live or unverifiable mode; do not change live catalog or webhook configuration to compensate.
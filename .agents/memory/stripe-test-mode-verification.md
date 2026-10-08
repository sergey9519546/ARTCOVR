---
name: Stripe test-mode verification
description: Controlled checkout verification must use the explicitly bound development Stripe connection
---

Do not assume `NODE_ENV=development`, `REPLIT_ENVIRONMENT=development`, or reconnecting the development Stripe connection makes `ReplitConnectors.proxy("stripe")` use test mode. In an artifact workflow, the proxy returned live-mode webhook endpoints despite a confirmed test-mode development connection and development run command.

**Why:** The connector proxy did not expose a documented per-connection selector, and the app correctly refused to initialize when webhook `livemode` disagreed with the requested runtime. A credential-fetch fallback using `/api/v2/connection?include_secrets=true` returned the development connection without `settings.secret_key` in this app context.

**How to apply:** Verify Stripe `livemode` before any write and keep test flows fail-closed on mismatch. Do not touch live catalog or webhook configuration to compensate. Retry after a development-connection refresh; if the proxy still returns live data, stop until a documented environment selector or platform fix is available.
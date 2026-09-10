---
name: Stripe test-mode verification
description: Controlled checkout verification must use the explicitly bound development Stripe connection
---

Do not assume setting `NODE_ENV=development` selects Stripe test credentials when the Replit environment is production. Bind the development Stripe connection explicitly for controlled test-mode checkout verification.

**Why:** The platform connector proxy can continue selecting the production Stripe connection based on its environment, causing a locally expected test checkout to create a live session that the app correctly rejects.

**How to apply:** Verify the selected connection environment and session `livemode` before payment. If mode validation fails after Stripe creates an open session, expire that session before surfacing the failure. Keep test checkout prices/products isolated and deactivate temporary catalog entries after the run. For artifact development workflows, put the binding directly in the run command; a nested development env block may not override the platform's inherited production environment.
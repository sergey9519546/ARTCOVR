---
name: Clerk browser signup checks
description: Constraint discovered when running full customer auth journeys in Chromium
---

Real-browser Clerk signup checks can be stopped by the development tenant's Cloudflare anti-bot challenge before email verification. Keep the journey strict and fail with an explicit tenant-configuration message rather than treating the challenge as a successful signup.

**Why:** A headless browser can render the complete signup form and submit it, but the tenant may require an interactive human challenge that is not reliably automatable.

**How to apply:** Run the opt-in guest-purchase browser check with a Clerk test tenant/configuration that allows automated signup and a known verification code; keep ordinary storefront E2E checks independent of that environment.
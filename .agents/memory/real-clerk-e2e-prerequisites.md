---
name: Real Clerk E2E prerequisites
description: Requirements for running browser journeys against the real development Clerk tenant instead of the deterministic auth shim.
---

The real Clerk browser journey requires an explicit disposable test-account configuration: enable the real-auth switch and provide a test email domain, password, verification code, and Clerk backend access through the environment.

**Why:** The deterministic Playwright sign-in shim validates storefront state transitions but cannot prove Clerk session issuance, ownership scoping, verified-email behavior, or account-bound generation access.

**How to apply:** Treat a skipped real-auth journey as an environment gap, not a passing signed-in verification. For API account-privacy checks, create two temporary Clerk test users and sessions, seed isolated account rows, assert both ownership and response-field boundaries, then verify every fixture is removed. Never weaken the API auth boundary or reuse a personal account to bypass the missing disposable test-account setup.

Local Playwright runs must use the workspace's development Clerk publishable key. Keep any production-format key fixture used to satisfy production-build validation out of the browser environment; on loopback, it can be rewritten to `clerk.127.0.0.1`, where Clerk JS does not load.

**Why:** The production build fixture is not a valid Clerk instance for a local browser origin; the resulting script load failure makes public-route tests time out even though the development key loads those routes.

**How to apply:** Scope the production-format fixture to the build check only. Run local browser tests with the existing development configuration, without changing saved auth settings.
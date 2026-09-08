---
name: Real Clerk E2E prerequisites
description: Requirements for running browser journeys against the real development Clerk tenant instead of the deterministic auth shim.
---

The real Clerk browser journey requires an explicit disposable test-account configuration: enable the real-auth switch and provide a test email domain, password, verification code, and Clerk backend access through the environment.

**Why:** The deterministic Playwright sign-in shim validates storefront state transitions but cannot prove Clerk session issuance, ownership scoping, verified-email behavior, or account-bound generation access.

**How to apply:** Treat a skipped real-auth journey as an environment gap, not a passing signed-in verification. For API account-privacy checks, create two temporary Clerk test users and sessions, seed isolated account rows, assert both ownership and response-field boundaries, then verify every fixture is removed. Never weaken the API auth boundary or reuse a personal account to bypass the missing disposable test-account setup.
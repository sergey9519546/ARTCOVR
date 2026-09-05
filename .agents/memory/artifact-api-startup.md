---
name: Artifact API startup
description: Startup ordering for API artifacts whose initialization calls external services
---

API artifact servers should bind and report readiness on the injected PORT before running optional external-service setup such as Stripe webhook registration.

**Why:** A slow or unavailable connector call before `listen` prevents the managed workflow from observing its port and is reported as a port timeout even when the build is healthy.

**How to apply:** Start the HTTP server first, then run non-essential initialization asynchronously with explicit logging. Keep request-time failures visible rather than silently falling back.
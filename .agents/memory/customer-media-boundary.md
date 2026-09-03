---
name: Customer media boundary
description: Customer uploads and generated media must resolve through owned database records and short-lived signed URLs.
---

Customer-facing media APIs should expose opaque record IDs only; object keys remain server-owned, every lookup is scoped to the authenticated Clerk subject, and URLs are signed only after entitlement checks.

**Why:** Object storage paths are capabilities. Returning or accepting them from the browser would bypass ownership, expiry, and revocation rules.

**How to apply:** Keep upload, generation, account, and download routes on the same ownership/entitlement boundary even if storage providers or frontend callers change.
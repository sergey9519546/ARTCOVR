---
name: Release smoke outage reasons
description: Preserve configured-target network failure reasons across the development smoke subprocess boundary
---

Configured-target smoke failures must carry a sanitized stderr reason through the child-process wrapper; an exit code alone cannot distinguish DNS resolution from request timeout outages.

**Why:** The smoke command owns the underlying fetch error, while the release wrapper owns configured-target context. Without an explicit stderr contract, the wrapper can only report a generic nonzero exit and obscures the fastest diagnosis.

**How to apply:** Normalize DNS and timeout errors inside the development smoke command, capture stderr in the wrapper, and classify that captured output without attaching disposable API startup or teardown diagnostics.
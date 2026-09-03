---
name: Public artwork delivery
description: Performance boundary between the repository's public catalog assets and App Storage.
---

Keep canonical public catalog artwork with the static artifact and serve smaller modern-format derivatives to browsers. Do not move these files to App Storage solely as a performance fix.

**Why:** App Storage changes where identical bytes are served but does not automatically resize or transcode them. The primary bottleneck was oversized JPEG transfer, while responsive WebP derivatives materially reduced card payloads.

**How to apply:** Optimize dimensions and formats first, preserve a canonical fallback, and measure production cache headers and request timing before reconsidering storage architecture.
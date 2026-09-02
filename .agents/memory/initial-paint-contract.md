---
name: Initial paint contract
description: The homepage's first visible frame must be the existing React preloader, without an extra static loading shell.
---

The first visible homepage frame must come from the existing React preloader, beginning at its normal `000` state. Do not add a separate static wordmark, counter, progress bar, or branded loading shell before React mounts.

**Why:** The user explicitly rejected an added static shell because it created an extra frame before the intended animation and made the intro feel like it started twice.

**How to apply:** Keep pre-React crawlable fallback content visually hidden during development, while allowing the production static-route renderer to replace the fallback markers with its normal crawlable page content.
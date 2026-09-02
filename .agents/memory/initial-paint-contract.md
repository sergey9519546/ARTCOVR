---
name: Initial paint contract
description: The homepage's first visible frame must be the existing React preloader, without an extra static loading shell.
---

The first visible homepage frame must come from the existing React preloader, beginning at its normal `000` state. Do not add a separate static wordmark, counter, progress bar, branded loading shell, theme boot script, or inline shell styling before React mounts.

**Why:** The user explicitly rejected an added static shell because it created an extra frame before the intended animation and made the intro feel like it started twice.

**How to apply:** Keep the pre-React root empty in development. Production static-route generation may replace its markers with crawlable page content, but development startup must proceed directly from the empty root to the React preloader.
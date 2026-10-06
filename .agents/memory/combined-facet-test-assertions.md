---
name: Combined facet test assertions
description: How to avoid false positives when browser tests apply archive filters one at a time.
---

When testing cumulative catalog filters, verify that each newly selected facet appears in the URL or its control state before treating a nonzero result count as success. A prior filter can leave results visible even when the next selection did not take effect.

**Why:** A browser test helper once accepted a positive count from the already-selected genre and color while the mood selector was still set to “All moods.”

**How to apply:** After choosing each facet, assert its URL parameter and selected control, then check that the resulting count is nonzero before moving to the next facet.

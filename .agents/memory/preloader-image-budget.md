---
name: Preloader image budget
description: The homepage intro's eager artwork loading and responsive image requirements
---

The homepage preloader must use the same responsive derivative pipeline as catalog cards instead of loading original artwork files directly.

**Why:** The intro intentionally loads multiple covers before the animation completes, so raw originals multiply the initial payload even when the rest of the storefront is optimized. A measured audit reduced the homepage artwork payload from roughly 9.5 MB to 3.2 MB without changing the intro timing or first-frame contract.

**How to apply:** When changing preloader imagery, preserve the animation's eager availability but render through the catalog-aware image component with explicit display sizing. Re-measure request count and bytes on the homepage after changes.
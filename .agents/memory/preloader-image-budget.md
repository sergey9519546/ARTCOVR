---
name: Preloader image budget
description: The homepage intro's staged artwork loading and responsive image requirements
---

The homepage preloader should keep only its first optimized cover mounted eagerly. Mount later covers for their animation stage, and reserve high fetch priority for actual content heroes rather than hidden intro art.

**Why:** Inserting all eighteen covers at once creates an unnecessary initial request burst, even when most are hidden. Staging images preserves the animation while reducing competition with meaningful page content.

**How to apply:** Keep the first cover eagerly available through the catalog-aware responsive image component. Mount each later cover immediately before its reveal and load it lazily; do not assign high fetch priority to the preloader stack.
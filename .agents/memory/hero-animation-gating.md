---
name: Hero animation gating
description: The safe relationship between CSS first-paint hiding, the loaded class, and GSAP cleanup.
---

The hero entrance is CSS-owned from start to finish. Apply the hidden/offset state while `html:not(.loaded)`, then add `html.loaded` when the preloader curtain starts its exit so both transitions run as one reveal.

**Why:** Letting GSAP take over a CSS percentage transform composed the offsets and made the wordmark jump away before revealing. Starting the JS timeline after the curtain also exposed final copy, hid it, then revealed it again.

**How to apply:** Keep the entrance free of inline transform writes, start it with the curtain exit callback, unblock interaction only on preloader completion, and verify opacity/transform move monotonically across animated and static modes. For UI visibility keyed to whether the hero is on screen, use an intersection observer rather than a scroll listener so Lenis-driven reverse scrolling updates reliably.
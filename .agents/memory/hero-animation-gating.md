---
name: Hero animation gating
description: The safe relationship between CSS first-paint hiding, the loaded class, and GSAP cleanup.
---

The hero entrance is CSS-owned from start to finish. Apply the hidden/offset state while `html:not(.loaded)`, then add `html.loaded` when the preloader curtain starts its exit so both transitions run as one reveal. The preloader has a separate static contract from heavy scroll motion: mobile may run the intro, while explicit reduced-motion preferences bypass it. Static presentation must be decided in initial React state, not after the first effect.

**Why:** Letting GSAP take over a CSS percentage transform composed the offsets and made the wordmark jump away before revealing. Starting the JS timeline after the curtain also exposed final copy, hid it, then revealed it again. Effect-time dismissal leaves a one-frame counter flash on narrow or coarse-pointer layouts.

**How to apply:** Keep the entrance free of inline transform writes, start it with the curtain exit callback, unblock interaction only on preloader completion, and initialize reduced-motion preloader state before paint. Keep coarse-pointer and narrow-screen checks for Lenis/parallax eligibility, not for suppressing the mobile intro. Verify opacity/transform across animated modes and assert that reduced-motion mode renders no preloader frame. For UI visibility keyed to whether the hero is on screen, use an intersection observer rather than a scroll listener so Lenis-driven reverse scrolling updates reliably.
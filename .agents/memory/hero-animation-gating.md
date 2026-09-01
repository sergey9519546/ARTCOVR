---
name: Hero animation gating
description: The safe relationship between CSS first-paint hiding, the loaded class, and GSAP cleanup.
---

The hero wordmark may use a CSS off-canvas start state only while `html:not(.loaded)` is true; once the preloader opens the gate, add `html.loaded` before GSAP clears the completed transform.

**Why:** Keeping a zero transform inline after the tween masks a CSS regression but breaks the intended clean final state and browser assertions that expect `transform: none`.

**How to apply:** When changing the entrance timeline or preloader gate, verify the order of `preloaderDone`, `html.loaded`, the layout effect, and `clearProps` across animated desktop and static motion modes.
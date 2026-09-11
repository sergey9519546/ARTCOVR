---
name: Mockup graduation contracts
description: Durable accessibility and test-hook constraints when replacing production controls with approved visual mockups
---

When graduating an approved control mockup, preserve the production component's data hooks, stable accessible names, and complete option visibility before changing its visual hierarchy.

**Why:** Browser journeys and assistive technology depend on those contracts even when the prototype only represents the happy-path appearance. A visually correct replacement can otherwise hide live options or make existing filter actions unreachable.

**How to apply:** Read the production component and its browser tests before translating the mockup. Keep `data-*` facet boundaries, `aria-pressed` semantics, clear-state labels, and all live options intact; then verify the existing interaction suite after styling.
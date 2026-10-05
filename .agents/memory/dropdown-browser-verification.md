---
name: Dropdown browser verification
description: Reliable archive dropdown state checks in headless browser runs
---

Prefer keyboard navigation for archive dropdown state verification when pointer actions repeatedly report visible options outside the viewport.

**Why:** Headless archive checks have observed dropdown options resolving as visible but failing pointer actionability. Keyboard navigation successfully exercises the real selected and highlighted states without forcing clicks or changing production scrolling.

**How to apply:** Open the dropdown normally, then use Home, ArrowDown, Enter, and Escape to verify its states and selection behavior. Do not treat keyboard coverage as proof that pointer interaction has been verified.

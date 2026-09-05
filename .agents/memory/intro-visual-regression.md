---
name: Intro visual regression timing
description: Stable visual regression checks for the timed homepage intro composition
---

Timed intro screenshots must hold the real lockup active at a fixed presentation state rather than waiting for an intermediate counter value.

**Why:** Browser startup and image loading can make several scheduled counter updates happen before a polling assertion observes them, and the exit curtain can begin while a screenshot is being captured.

**How to apply:** Use a development-only visual-test presentation that preserves the production markup and fixed viewport/theme inputs; keep the normal timing and exit tests on the unmodified timeline.
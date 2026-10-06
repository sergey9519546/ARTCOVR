---
name: Archive palette snapshot baselines
description: Keep archive filter screenshots aligned with intentional theme contrast changes without weakening visual comparison.
---

When archive filter contrast tokens change intentionally, update the screenshots for every affected theme, viewport, and filter state. A color change can exceed Playwright's pixel threshold in one viewport while remaining below it in another, so a partially passing matrix can still contain stale expected colors.

**Why:** The contrast correction changed muted and accent text in light and dark themes. Tablet dark snapshots exposed the drift most clearly, while desktop and mobile showed the same stale colors with fewer reported mismatches.

**How to apply:** Compare the current token values with snapshot history, regenerate only the visual matrix affected by the intentional change, then rerun those tests with snapshot updates disabled. Do not raise global pixel tolerances to suppress the mismatch.

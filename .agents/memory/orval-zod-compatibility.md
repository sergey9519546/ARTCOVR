---
name: Orval Zod compatibility
description: Keep generated validators compatible with the workspace Zod runtime
---

When the workspace uses Zod 3, configure Orval's Zod output with `version: 3` rather than leaving the version on `auto`.

**Why:** The current Orval generator can select Zod 4-style top-level helpers such as `zod.email()`, `zod.int()`, and `zod.url()` even when the workspace runtime is Zod 3, causing generated library typechecks to fail.

**How to apply:** Pin the version in the API generator configuration and rerun code generation whenever the API specification changes. Revisit the pin only when the workspace Zod dependency is intentionally upgraded.
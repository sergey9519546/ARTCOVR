---
name: Vite route HTML emission
description: Build-hook timing for emitting crawler-visible route HTML from a Vite SPA shell.
---

When generating route-specific HTML from Vite’s transformed SPA shell, read and clone the built `index.html` in a post-write hook rather than expecting it in an earlier Rollup bundle hook.

**Why:** In this workspace’s Vite version, application chunks were available during `generateBundle`, but the transformed HTML asset was not yet present. Route generation there made an otherwise valid production build fail.

**How to apply:** Use the HTML transform hook for route-aware development responses, then a post-write build hook for static route files. Keep metadata markers in every transformed shell so the post-write replacement remains deterministic.
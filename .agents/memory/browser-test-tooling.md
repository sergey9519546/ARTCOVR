---
name: Artifact-scoped browser tooling
description: Workspace-specific dependency installation guidance for browser tests
---

When adding a JavaScript test dependency to one artifact in this pnpm workspace, use the package manager with that artifact's workspace filter rather than the generic installer.

**Why:** The generic package installer targets the workspace root, and pnpm rejects that operation unless the dependency is intentionally a root dependency.

**How to apply:** Install with the target package filter, then commit the artifact package manifest and workspace lockfile changes together.

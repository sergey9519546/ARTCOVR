---
name: Dependency audit coverage
description: Scanner differences and handling unpatched transitive glob dependencies.
---

A zero-finding pnpm audit is not proof that the platform's OSV dependency scan is clean. Verify both when closing dependency-security work, and distinguish assigned advisories from newly discovered findings.

**Why:** On 2026-10-06, pnpm reported zero after the assigned fixes while the platform scanner found four other advisories, including a critical proxy trust issue.

**How to apply:** Report the results separately; do not claim a clean security scan or publish readiness from pnpm alone.

Avoid reintroducing glob wrappers that depend on unpatched `braces` unless current upstream advisory data confirms a safe release.

**Why:** The deeply nested-pattern stack-exhaustion advisory had no patched upstream version. Removing the higher-level proxy wrapper while keeping its existing transport, and using native file discovery, eliminated the vulnerable dependency without an incompatible override or suppression.

**How to apply:** Check the complete transitive graph before adding proxy or glob helpers. Prefer the existing lower-level transport or native runtime capabilities when these preserve the required behavior.

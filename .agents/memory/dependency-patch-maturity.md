---
name: Dependency patch maturity
description: Choosing secure package versions when the workspace enforces a minimum release age
---

Security overrides must satisfy both the advisory's patched range and the workspace's minimum release-age policy. When today's newest patch is blocked, use the newest older patch that closes every applicable advisory rather than bypassing the policy.

**Why:** A newly published security release can be technically correct but intentionally unavailable until it reaches the repository's maturity window.

**How to apply:** Compare all advisory patched ranges for the package, select the newest version old enough for the configured window, regenerate the lockfile, and require a zero-advisory audit.
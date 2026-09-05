---
name: Archived Bun lockfiles
description: How to handle vulnerable dependency snapshots in retired Bun-based backups.
---

Do not retain a vulnerable Bun lockfile solely to preserve dependency snapshots for a retired backup when the patched graph requires separate overrides for multiple major lines.

**Why:** Bun 1.3 does not support nested overrides, so a single global override can force incompatible majors while leaving the original transitive graph unsafe. A patched manifest without the obsolete generated snapshot is safer and remains restorable.

**How to apply:** Upgrade direct constraints first. If only inactive backup lockfiles retain findings and safe same-major transitive overrides cannot be expressed, remove those generated locks rather than applying incompatible global overrides. Keep active package-manager lockfiles intact.
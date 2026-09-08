---
name: Release process lifecycle tests
description: Deterministic child-process signal tests must synchronize with harness readiness
---

Signal assertions against a disposable child process must wait for an explicit readiness marker before sending the first signal.

**Why:** A child can have a PID while its signal handlers are still being installed; signaling during that race can make a graceful-shutdown test appear to pass through forced termination.

**How to apply:** Have the harness emit a ready marker after installing its handlers, then exercise graceful and forced termination through the real child-process API.
---
name: GSAP pinned journey lifecycle
description: Cleanup constraints for the ARTCOVR archive journey's ScrollTrigger pin.
---

The DOM element used as a ScrollTrigger pin target must remain mounted while its
motion/static presentation changes, and the trigger must be disabled before an
animated route transition removes the journey.

**Why:** ScrollTrigger wraps and re-parents pinned elements. Replacing the
target subtree while that wrapper is still active can make React reconcile
against a stale parent and surface removeChild or invalid-hook errors.

**How to apply:** Keep a stable host around the layered and static journey
variants, perform trigger teardown in a layout-effect cleanup with an idempotent
kill, and include transition state in the host's enabled signal.

Pinned journey layers must seed from the trigger's live scroll coordinates when
they register, and the store should also synchronize native scroll events.

**Why:** Lenis and delayed ScrollTrigger scrubbing can leave a newly mounted
layer at progress zero even though the pinned section is already mid-journey;
the shared handoff then disappears at otherwise valid desktop widths.

**How to apply:** Treat ScrollTrigger progress as the animation source of truth,
but derive a current progress sample from the trigger's absolute start/end
positions for registration and native programmatic-scroll probes.
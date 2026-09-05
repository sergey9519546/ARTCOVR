---
name: Route transition curtain
description: Navigation behavior for code-split ARTCOVR routes under slow chunk loads.
---

Code-split route loading must not expose a plain loading message after the page-transition curtain begins opening. Warm destination chunks from shared links and keep any remaining Suspense fallback visually consistent with the ARTCOVR curtain.

**Why:** A slow lazy-route chunk can otherwise replace the outgoing page with an unbranded “Loading page…” frame midway through navigation, which reads as a visual glitch and breaks the intended transition.

**How to apply:** When adding or changing route splitting, preserve shared-link prefetching, router transition handling, and a full-screen branded fallback; test with an intentionally delayed route chunk.
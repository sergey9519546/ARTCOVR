---
name: Route schema delivery
description: Why shared route schemas should remain code-split and navigation-safe.
---

Keep route-schema generation shared across initial HTML and client navigation, but do not eagerly pull complete guide content into the homepage entry bundle.

**Why:** Eagerly sharing guide schemas pushed the homepage past its existing minified JavaScript budget. Loading the shared generator separately preserves rendering consistency without expanding the entry bundle.

**How to apply:** Preserve matching initial-route JSON-LD while schema code loads, remove previous-route markup on navigation, and cancel obsolete asynchronous work so a delayed load cannot overwrite the current route. Do not restore separate page-owned copies that can diverge from the static graph.

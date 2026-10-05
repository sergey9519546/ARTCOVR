---
name: Autoscale static route resolution
description: Production behavior for prerendered nested pages in the ARTCOVR static artifact on Autoscale.
---

For ARTCOVR's static artifact on an Autoscale deployment, route-specific `index.html` files can be served through native directory-index resolution after the host appends a trailing slash. Broad wildcard rewrites on `/product/*` or `/cover-art/*` can interfere with that lookup and return 404s, even when the generated `index.html` is directly reachable. Root `.replit` static-deployment rewrites do not apply to Autoscale; use the artifact's production routing configuration only when a rewrite is genuinely required.

**Why:** Live HTTP checks showed the failure only on catalog paths with wildcard rewrite rules, while other nested directories and direct `index.html` files returned the expected content.

**How to apply:** For nested static routes, compare the no-slash URL, redirected slash URL, and direct `index.html` URL under real HTTP. Prefer native directory-index resolution when it returns route-specific HTML; retain real 404s for paths with no generated directory, and verify after publishing.

---
name: Analytics route normalization
description: Production pageview paths can include trailing slashes even when client routes do not.
---

Normalize trailing slashes when grouping storefront analytics routes; for example, treat `/archive` and `/archive/` as the same route while preserving `/` as the homepage.

**Why:** The published static storefront currently records both slash and no-slash variants, which otherwise understates archive traffic and distorts pageview funnels.

**How to apply:** Use explicit canonical predicates for root, archive, product, and checkout paths in `queryAppAnalytics` reports, and exclude non-storefront service paths before aggregating.
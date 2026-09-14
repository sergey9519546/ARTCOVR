---
name: Live inventory structured data
description: When ARTCOVR may publish Product and Offer schema for reservable or exclusive artwork.
---

Do not emit Product or Offer structured data from build-time catalog facts when checkout availability depends on current reservations or completed sales. Keep artwork pages discoverable through ImageObject, WebPage, and BreadcrumbList entities until page generation can read authoritative live inventory state.

**Why:** Exclusive artwork can become unavailable during a timed reservation or after payment while static catalog fields still look purchasable. Hardcoded availability creates misleading rich-result markup.

**How to apply:** If live inventory is later added to the page response, derive visible availability and Schema.org availability from the same authoritative state and the same reservation-expiry rules used by checkout.
---
name: Live inventory structured data
description: Inventory truthfulness in ARTCOVR structured data and static machine discovery.
---

Do not emit Product or Offer structured data from build-time catalog facts when checkout availability depends on current reservations or completed sales. Keep artwork pages discoverable through ImageObject, WebPage, and BreadcrumbList entities until page generation can read authoritative live inventory state.

**Why:** Exclusive artwork can become unavailable during a timed reservation or after payment while static catalog fields still look purchasable. Hardcoded availability creates misleading rich-result markup.

**How to apply:** If live inventory is later added to the page response, derive visible availability and Schema.org availability from the same authoritative state and the same reservation-expiry rules used by checkout.

Static machine discovery must distinguish sale eligibility from current exclusive inventory. Require a live check for exclusives in both JSON feeds and AI discovery text; do not promise immediate purchase from publication, rights approval, or sale mode alone.

**Why:** Inventory may change after a build, and a static feed cannot know whether a published exclusive is available, reserved, or sold. Honest static semantics address discovery accuracy without introducing a new purchasing flow.

**How to apply:** Keep static discovery conservative even when an exclusive was available at build time. Version machine contracts when availability semantics change, and retain authoritative inventory enforcement at purchase/fulfillment.
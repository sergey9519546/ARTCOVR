# SEO Strategy

## In scope
- Public ARTCOVR storefront routes: home, archive, cover-art genre collections, licensing/AI-rights guides, published product pages, about, FAQ, contact, license, refunds, privacy, and terms.
- Public catalog discovery, social previews, structured data, AI-crawler visibility, and source-detectable WCAG 2.2 A/AA issues.

## Out of scope
- Authenticated account and owner UI routes (`/my-images`, `/catalog-intelligence`, `/sales`), sign-in/sign-up flows, checkout UI, and mockup/design sandbox. Task 259 includes read-only API-source review solely for catalog/price/licensing/feed agreements and account/customer-media protection; these routes are not indexing targets.

## Target audience
- Artists, musicians, and creative-project owners seeking distinctive square cover art with commercial licensing and prompt-based editing.

## Primary keywords
- Cover art, commercial cover art license, cover art archive, AI cover art editing, square cover artwork.

## Crawler assumptions
- Public routes must provide crawlable, route-specific HTML and metadata to Google, social-preview bots, and AI crawlers. Client-side hydration alone is insufficient.

## Rendering and content strategy
- Public storefront is Vite/React with build-time static HTML generation; the homepage supplies its semantic catalog content in noscript while preserving the interactive intro.
- Genre collections are derived from approved public catalog metadata; guides include sources and publication/review dates.
- Public artwork schema intentionally uses ImageObject licensing markup without static Product/Offer inventory claims; checkout availability is dynamic.

## Dismissed categories
- (None yet)

## Durable scan context (task 259)
- Intended canonical origin: https://artcovr.com; local/test generated artifacts may use artcovr.local and must not be deployed unchanged. Deployed origin/version requires separate verification.
- Current discovery scope: 187 approved products, 20 genre collections, 13 fixed indexable pages (220 intended public URLs).
- Buyer intent spans music-release/album/single cover art, genre discovery, commercial licenses, exclusive versus repeatable licensing, AI rights, and prompt customization. Validate search demand before adding editorial pages.
- Static machine-readable inventory must not assert current exclusive availability without dynamic inventory evidence. Preserve approved prices/currency/licensing and never invent reviews, ratings or creator identities.
- Privacy processor descriptions require owner approval and agreement between initial HTML and client content.
- Source-only audits do not establish deployed status, measured CWV, search-account indexing, actual inventory or AI citations.

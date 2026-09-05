# PRODUCT CONTRACT & BUSINESS INVARIANTS

## 1. Catalog & Publishing
- **Launch Review Catalog**: At least 100 owner-curated cover artworks are staged for launch review (currently **187 published / 217 approved**, including 30 delete-tier excluded from publication; ADR-019 and ADR-021 permit growth past the 100-review launch set).
- **Explicit Approval Gate**: An artwork becomes purchasable and publicly indexed ONLY when `rightsApproved = true`, `published = true`, and a valid `priceCents` is assigned in `approved-artworks.json`.
- **Sale Modes**: Exactly two sale modes: `exclusive` (delisted on purchase) and `repeatable` (multi-license).
- **Zero Pad / Zero Fake**: Never invent or pad artworks; never publish unapproved candidate assets.
- **Delivery Claims**: The square >=1024px catalog gate proves technical validity, not readiness for a named music distributor. The storage plan proves only native dimension eligibility; distributor claims require every applicable current channel rule. Never upscale a smaller source merely to manufacture compliance (ADR-031).

## 2. Commerce & Financial Integrity
- **Price Freezing**: Stripe session creation snapshots the exact database price at reservation time; client parameters cannot tamper with the amount.
- **Concurrency & Locking**: SQL settlement `settle_purchase_paid` locks the artwork row before the purchase row (`FOR UPDATE`) to prevent double-selling exclusive artworks.
- **Idempotency**: Webhook processing is strictly idempotent. Repeated webhook deliveries produce no duplicated assets or receipts.
- **Revocation Safety**: In the event of a chargeback, refund, or dispute (`charge.dispute.created`), `revoke_purchase_access` immediately marks `access_revoked_at = now()`, disabling subsequent clean downloads.

## 3. Generative Pipeline
- **Raster Dimensions & Formats**: Valid generated images must be structurally valid WebP at 1024x1024 (previews) or 2048x2048 (master deliverables).
- **Rate Limits**:
  - Dual-Lane Global: Independent 4/min free lane and 4/min purchased lane (migration `202608140010`; independent advisory locks, up to 8/min combined). `bun run db:verify` has applied and behavior-checked this migration on disposable PostgreSQL 16. **Its live application remains unverified.** Until `request_generation` is inspected on the live database, conservatively assume the earlier single global lane remains operative, under which free traffic can deny generation to a paying customer.
  - User: Maximum 6 generations per 10 minutes, 24 generations per 24 hours.
- **Failure Clean-up**: If image generation or validation fails, intermediate storage objects are removed and active attempt slots are released.

## 4. User Experience & Design
- **Themes**: Support `dark`, `light`, and `red` (archive signal) themes with smooth CSS variable switching and persistent user preferences in `localStorage`.
- **Motion & Accessibility**: Fully accessible without JavaScript; instant bypass of preloader and page transitions when `prefers-reduced-motion: reduce`. Heavy scroll journeys adapt to static mode on coarse-pointer/mobile devices. No keyboard traps in mobile menus or snap containers.

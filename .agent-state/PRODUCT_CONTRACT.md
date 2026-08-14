# PRODUCT CONTRACT & BUSINESS INVARIANTS

## 1. Catalog & Publishing
- **100-Cover Review Catalog**: Exactly 100 owner-curated cover artworks are staged for launch review.
- **Explicit Approval Gate**: An artwork becomes purchasable and publicly indexed ONLY when `rights_approved = true`, `published = true`, and valid `price_cents` are assigned in `approved-artworks.json`.
- **Sale Modes**: Exactly two sale modes: `exclusive` (delisted on purchase) and `repeatable` (multi-license).
- **Zero Pad / Zero Fake**: Never invent or pad artworks; never publish unapproved candidate assets.

## 2. Commerce & Financial Integrity
- **Price Freezing**: Stripe session creation snapshots the exact database price at reservation time; client parameters cannot tamper with the amount.
- **Concurrency & Locking**: SQL settlement `settle_purchase_paid` locks the artwork row before the purchase row (`FOR UPDATE`) to prevent double-selling exclusive artworks.
- **Idempotency**: Webhook processing is strictly idempotent. Repeated webhook deliveries produce no duplicated assets or receipts.
- **Revocation Safety**: In the event of a chargeback, refund, or dispute (`charge.dispute.created`), `revoke_purchase_access` immediately marks `access_revoked_at = now()`, disabling subsequent clean downloads.

## 3. Generative Pipeline
- **Raster Dimensions & Formats**: Valid generated images must be structurally valid WebP at 1024x1024 (previews) or 2048x2048 (master deliverables).
- **Rate Limits**:
  - Global: Maximum 4 generations per minute across the platform.
  - User: Maximum 6 generations per 10 minutes, 24 generations per 24 hours.
- **Failure Clean-up**: If image generation or validation fails, intermediate storage objects are removed and active attempt slots are released.

## 4. User Experience & Design
- **Themes**: Support `dark`, `light`, and `red` (archive signal) themes with smooth CSS variable switching and persistent user preferences in `localStorage`.
- **Motion & Accessibility**: Fully accessible without JavaScript; instant bypass of preloader and page transitions when `prefers-reduced-motion: reduce` or pointer is coarse. No keyboard traps in mobile menus or snap containers.

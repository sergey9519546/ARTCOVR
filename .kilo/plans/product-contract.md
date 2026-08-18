# PRODUCT CONTRACT + INVARIANTS — ARTCOVR

## Who Uses This
- Buyers / collectors: discover art, preview, purchase, receive clean asset, access library.
- Sellers / rights-holders: approve artwork, set sale mode (`exclusive`/`repeatable`), manage publication.
- Operators / admins: approve/revoke artworks, resolve refunds, manage generation limits.

## What Is Sold
Distinctive square cover art. Purchase grants a licensed clean high-resolution asset (`clean_object_key`) with metadata snapshot (`base_object_key_snapshot`, `base_source_sha256_snapshot`, price at checkout). `exclusive` mode means single sale (`sold_at` set); `repeatable` allows multiple.

## Revenue Source
Stripe Checkout. `stripe_events` tracks webhook processing. `purchases` records settlement (`reserved` → `pending` → `paid` / `expired` / `refunded`).

## Customer Receives
Clean asset access durably until revoked (`access_revoked_at` set only on refund/chargeback). Preview generation (`generation` table, phase=`preview`, purchase_id=null) is free within allowance; purchased phase links to `purchases`.

## Key Relationships
`artworks` → `purchases` (many, constrained by sale_mode) → `stripe_events` (one per event) → `generations` (preview or purchased). `analytics_events` links user/artwork/purchase.

## Invariants (Enforced at Strongest Layer)
1. Catalog: `is_listed` requires rights + publication approval; clean originals never in `public/`.
2. Commerce: snapshot price/object before settlement; SQL lock artwork before purchase row insertion; `refunded`/`expired` only after valid transition; `access_revoked_at` durable; idempotency key rotation only on terminal rejection.
3. Theme / Accessibility: `light` authoritative; `red` deprecated but falls back to `light`; `prefers-reduced-motion` bypasses intro motion; WCAG AA maintained on all themes.
4. Auth / Security: RLS on `artworks`, `purchases`, `generations`, `inquiries`; webhook auth verified; secrets server-only; no client-authoritative price/state.

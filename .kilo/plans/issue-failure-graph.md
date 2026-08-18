# ISSUE / FAILURE GRAPH — ARTCOVR (Evidence-Based, 2026-08-18)

## Framework
SYMPTOM → ROOT CAUSE → SHARED ASSUMPTION → BLAST RADIUS → IMPACT → CORRECTION → PROOF

## Findings
**F1 — Catalog DB↔JSON coherence (highest leverage, SUSPECTED)**
- SYMPTOM: visitor may see a work they cannot buy, or a bought work stays invisible.
- ROOT CAUSE: display catalog = build-time `curated-public.json`; reservation catalog = DB `artworks`. Two sources; coherence depends on projection script.
- SHARED ASSUMPTION: projection keeps JSON and DB in lockstep.
- BLAST RADIUS: checkout failures, orphaned purchases, support load.
- IMPACT: lost revenue / broken trust.
- CORRECTION: add contract test (JSON slug ↔ DB is_listed+approved; reserve path succeeds both ways). Fix projection, not JSON.
- PROOF: test passes + manual reserve on a displayed slug.
- EVIDENCE: `src/lib/artcovr/artworks.ts:78-89` (selectPublicCatalog), `supabase/migrations/202608140009:60-103` (reserve_artwork validates DB).

**F2 — Dead components (WRONG EXISTENCE, CONFIRMED)**
- SYMPTOM: unused files ship in bundle.
- ROOT CAUSE: incomplete negative-code pass after parity/artcovr design split.
- CORRECTION: delete `parity/BackToTop.tsx`, `parity/ScrollToTop.tsx`, `parity/ProductCard.tsx` (zero imports confirmed via grep).
- PROOF: import grep = 0; lint clean.
- NOTE: `ThemeSwitcher`/`TiltedCarousel`/`SpiralScroll` are LIVE (via ScrollJourney/Header) — keep.

**F3 — Two nav/header systems (WRONG IMPLEMENTATION, CONFIRMED)**
- SYMPTOM: home (`parity/Header`+`ThemeSwitcher`) vs interior (`artcovr/SiteHeader`+`ThemeToggle`) may diverge.
- CORRECTION: extract single nav config; align both; keep `red`→`light` fallback identical.
- PROOF: visual diff + E2E nav.

**F4 — CSP unsafe-inline (WRONG IMPLEMENTATION, CONFIRMED)**
- SYMPTOM: `script-src 'unsafe-inline'` permits any inline script.
- ROOT CAUSE: static export cannot use per-response nonces.
- CORRECTION: keep only trusted inline; consider hash-pinning the 2 known blocks; document residual risk.
- EVIDENCE: `next.config.ts:6`, `public/vercel.json:16`.

**F5 — Unknown baseline (WRONG ABSENCE, UNKNOWN)**
- SYMPTOM: unknown whether `npm verify` is green this session.
- CORRECTION: run `npm run verify` as Step 0 gating work.

## Verified-Correct (Do Not Break)
- Settlement lock: artwork row locked `FOR UPDATE` before purchase insert (`202608110004:22`, `202608140009:55-63`).
- Webhook idempotency + reconciliation + foreign-event handling (`stripe-webhook/index.ts`).
- RLS revokes all direct table/storage access; Edge Functions only (`202608110003`).
- Client never sets price/currency; amount re-derived from DB at reserve.
- `red` theme deprecated but safely falls back to `light`.

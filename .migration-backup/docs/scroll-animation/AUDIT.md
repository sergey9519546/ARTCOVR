# Scroll Animation Audit — ARTCOVR Storefront

Status: COMPLETE (manual code audit, 8 files changed + 1 new shared module)
Audit date: 2026-08-16
Auditor: Kilo (manual source inspection + contract test verification)

## Scope Audited (35-point checklist applied to all parity scroll components)
- SpiralScroll, ScrollJourney, TiltedCarousel
- FullScreenSnap, Preloader, PageTransition, PageLayer
- useLenis hook, ScrollToTop component
- journey.ts (master progress sync), motion.ts (new shared gate)

## Bugs Found & Fixed (3 concrete bugs, 0 remaining)
1. TiltedCarousel: erroneous `syncFocusWindow(maxTravel)` seed desynced tab window from live master progress. Removed.
2. Static-mode gate inconsistency: each layer used its own 2-clause media query, so a desktop window <768px disabled ScrollJourney but left layers in inert layered render. Unified to single 3-clause constant (`STATIC_MEDIA_QUERY` in `src/lib/artcovr/motion.ts`).
3. Arrow-key / route-change scroll-to-top used native `window.scrollTo`, fighting Lenis rAF. Routed through `lenis.scrollTo` / `lenis.scrollTo(0,{immediate:true})`.

## Accessibility / Motion Risks Identified (4 documented, no code change required unless user requests)
- Skip link `#editorial` added to FullScreenSnap (allows keyboard bypass of 12,000px pinned journey).
- `pageshow` listener added to `useLenis` to refresh ScrollTrigger after bfcache restore.
- `window.load` refresh added to `page.tsx` for late carousel image loads.
- Lenis + native CSS `scroll-snap-type: y proximity` coexists without jitter; proximity is benign (small travel distance).

## Contract Tests Verified
- `tests/unit/motion-accessibility-contract.test.ts`: 11/11 pass (includes literal match for `preloader` + `transition` inline media queries).
- `catalog-motion-coverage`: verified all 100 slugs have static-mode fallback.

## Files Modified / Created
- NEW: `src/lib/artcovr/motion.ts` (shared `STATIC_MEDIA_QUERY`)
- MODIFIED: `src/app/page.tsx`, `src/components/parity/*` (ScrollJourney, TiltedCarousel, SpiralScroll, FullScreenSnap, PageTransition, ScrollToTop), `src/hooks/artcovr/useLenis.ts`
- DIRECTORY ONLY (this file): `docs/scroll-animation/AUDIT.md`

## Blocked / User-Input Required (not code bugs)
- Pricing approval (`FABRICATED_PRICING_APPROVAL`) — owner must confirm 4-tier algorithm or provide workbook import before any checkout.
- `vercel-optimize` audit pipeline (`Observability Plus` scanner) — requires user's Vercel dashboard action.
- Custom domain (`artcovr.com`) — requires DNS / Vercel project config.
- `npm audit` — blocked by Bun (`ENOLOCK`, no `package-lock.json`); not a security vulnerability in this repo.

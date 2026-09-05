# SYSTEM MAP — ARTCOVR

## Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │      Next.js 16 (App Router)        │
                        │    React 19 / Tailwind CSS v4       │
                        └──────────────────┬──────────────────┘
                                           │
                ┌──────────────────────────┼─────────────────────────┐
                ▼                          ▼                         ▼
   ┌─────────────────────────┐ ┌─────────────────────────┐ ┌────────────────────────┐
   │    Public Storefront    │ │   Client & Checkout     │ │     Edge Functions     │
   │  - / (Homepage & Hero)  │ │  - /checkout/[slug]     │ │  - create-checkout     │
   │  - /archive (Catalog)   │ │  - Stripe Checkout      │ │  - stripe-webhook      │
   │  - /product/[slug]      │ │  - /my-images (Account) │ │  - generate-image      │
   │  - /about, /faq, etc.   │ │  - Prompt / Gen Studio  │ │  - my-images           │
   └─────────────────────────┘ └─────────────────────────┘ └───────────┬────────────┘
                                                                       │
                                           ┌───────────────────────────┴──────────┐
                                           ▼                                      ▼
                              ┌─────────────────────────┐            ┌────────────────────────┐
                              │  Supabase (PostgreSQL)  │            │ Supabase Storage       │
                              │  - artworks             │            │ - private clean assets │
                              │  - purchases            │            │ - preview derivatives  │
                              │  - generations          │            └────────────────────────┘
                              │  - RLS & Settle RPCs    │
                              └─────────────────────────┘
```

## Surfaces & Responsibilities
- **Storefront & Catalog**:
  - `src/app/page.tsx`: Interactive hero, 100-artwork showcase (grid, tilted carousel, spiral scroll, full screen snap).
  - `src/app/archive/page.tsx`: Searchable catalog with client-side text filtering across category, mood, color, and descriptions.
  - `src/app/product/[slug]/page.tsx`: Product detail view, license breakdown, high-res preview, direct purchase or prompt remix action.
  - `src/components/parity/*`: CustomCursor, Preloader, Header, MobileMenu, ThemeSwitcher, Footer, SpiralScroll, TiltedCarousel, FullScreenSnap.
- **Account & Generative Studio**:
  - `src/app/my-images/page.tsx`: Customer entitlement view for purchased covers, download links, chained generative variations.
  - `src/components/artcovr/PurchasedGenerationStudio.tsx`: Post-purchase generation UI with Deno Edge Function integration.
  - `src/components/artcovr/PromptStudio.tsx`: Pre-checkout prompt iteration studio.
- **Backend & Commerce**:
  - `supabase/functions/create-checkout`: Reserves artwork, verifies pricing, creates Stripe Checkout session with frozen expiration.
  - `supabase/functions/stripe-webhook`: Idempotent settlement on `checkout.session.completed`, charge dispute handling, refund revocations.
  - `supabase/functions/generate-image`: Rate-limited AI image generation worker with WebP structural raster decoding and validation.
  - `supabase/migrations/202608130008_backend_integrity.sql`: Database schema, RLS policies, atomic purchase settlement RPCs.

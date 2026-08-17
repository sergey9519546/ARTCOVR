# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**OUTFIT® by ++hellohello** — an apparel / cover-art storefront built as a single-page scroll experience: preloader intro, hero, product grid, a pinned tilted carousel, a pinned 3D spiral, a scroll-snap brand section, footer. Plus product detail, bag, and four static content routes.

It is **frontend-only**. No auth, no orders, no server-side product data, no payment. Checkout is simulated. Do not infer otherwise from the dependency list — see [Dead code](#dead-code-inventory).

Stack (resolved versions from `bun.lock`, which sits ahead of the caret ranges in `package.json`):

| | |
|---|---|
| next | **16.1.3** (App Router, `output: "standalone"`) |
| react / react-dom | **19.2.3** |
| tailwindcss | **4.1.18** (CSS-first config — see [Theming](#theming)) |
| typescript | **5.9.3** |
| prisma / @prisma/client | **6.19.2** (dead code) |
| package manager | **Bun** (`bun.lock`) |

`worklog.md` at the repo root is the change/audit history and the only prose documentation.

## Commands

```bash
bun install
```

| Task | Command | Notes |
|---|---|---|
| Dev | `bun run dev` | **Not `next dev`.** Builds if `.next/standalone/server.js` is missing, then serves the *production standalone* build. No hot reload. |
| Dev (orchestrated) | `sh .zscripts/dev.sh` | `bun install` → `db:push` → `bun run dev` backgrounded → polls `:3000` for 60s → starts mini-services. The only `.zscripts` file that is path-portable. |
| Build | `bun run build` | `next build`, then copies `.next/static` + `public/` into `.next/standalone/` — required, the standalone server cannot serve assets without it. **Fails on Windows at the copy step** — see Trap 14. |
| Prod start | `bun run start` | `NODE_ENV=production node .next/standalone/server.js` |
| Lint | `bun run lint` | `eslint .` |
| Typecheck | `bun x tsc --noEmit` | No npm script. **Nothing in the build runs this** — see Trap 1. |
| DB schema apply | `bun run db:push` | `prisma db push --accept-data-loss`. **Use this, not `db:migrate`.** |
| DB client | `bun run db:generate` | |
| Regenerate icons | `bun run scripts/gen-icons.ts` | Writes `public/apple-touch-icon.png`, `icon-192.png`, `icon-512.png`. Run from repo root. |
| Regenerate OG image | `bun run scripts/gen-og-image.ts` | Writes `public/og-image.png` from `src/lib/outfit/paths.ts`. Run from repo root. |

`bun run dev` deliberately skips rebuilding when a standalone build already exists (fast startup). Force a rebuild by deleting `.next/` or running `bun run build` first.

### Tests

There is **no JS test runner** — no vitest, jest, playwright, or `bun test`. `tests/` holds three POSIX shell scripts that black-box the `.zscripts/*.sh` build helpers. They call those helpers directly; `build.sh`'s own orchestration and packaging are untested.

```bash
bash tests/database-runtime-build.sh
```

Run all: `for f in tests/*.sh; do bash "$f"; done`. Each script is one linear assertion sequence — no per-case selection.

| Script | Status | Requirement |
|---|---|---|
| `database-runtime-build.sh` | passes on Windows/Git Bash | none — stubs a fake `bun` on `PATH` |
| `python-runtime-build.sh` | passes **only if `uv` is installed** | real `uv` on `PATH`; nothing in this repo provides it |
| `python-runtime-container.sh` | **cannot pass** | Docker daemon **and** an image `z-ai-python-deploy-runner:test` that has no Dockerfile anywhere in this repo |

### Verified local toolchain (Windows dev box)

`bun` 1.3.14 ✓ · `node` v25.2.1 ✓ · `docker` CLI present but **daemon not running** · `perl` ✓ (needed by `build.sh`'s self-heal) · **`caddy` not installed** — so `.zscripts/start.sh` cannot complete locally · **`bunx` is not on `PATH`** — use `bun x <cmd>` instead.

## Architecture

### Routes

App Router only (`src/app/`), no `pages/`, no `middleware.ts`, no route groups, no per-route `error.tsx`.

| Path | File | Type | Data |
|---|---|---|---|
| `/` | `src/app/page.tsx` | client | none directly; orchestrates every section, each in its own `ErrorBoundary` |
| `/product/[slug]` | `src/app/product/[slug]/page.tsx` | client | matches `slug` against the spread of `productsRow1..4` |
| `/bag` | `src/app/bag/page.tsx` | client | `localStorage["bag"]` |
| `/about` | `src/app/about/page.tsx` | **server** | hardcoded JSX |
| `/faq` | `src/app/faq/page.tsx` | **server** | local `FAQS` array; renders answers via `dangerouslySetInnerHTML` |
| `/shipping-and-return` | `src/app/shipping-and-return/page.tsx` | **server** | hardcoded JSX |
| `/contact` | `src/app/contact/page.tsx` | client | form is fake — sets `sent=true`, no network call |
| `/api` | `src/app/api/route.ts` | handler | `{ message: "Hello, world!" }` |
| `/api/health` | `src/app/api/health/route.ts` | handler | `export const dynamic = "force-static"` — see Bug 1 |

Only `/about`, `/faq`, `/shipping-and-return` export `metadata`; the client routes inherit the root layout's. `dynamic = "force-static"` on `/api/health` is the **only** route segment config in the entire app.

### Root layout — `src/app/layout.tsx`

- Fonts via `next/font/local`, one family, variable `--font-outfit`, `display: "swap"`. **The weight mapping is counter-intuitive**: `-Regular.woff2`→400, `-Medium.woff2`→**700**, `-Bold.woff2`→**800**. There is no 900 file, yet `font-[900]` is used across pages, and `globals.css` sets `font-synthesis-weight: none` — so those requests silently resolve to 800 with no faux-bold.
- Preloads 3 preloader images + Regular and Medium fonts. Bold is **not** preloaded.
- **Pre-hydration inline script** stamps `data-theme` on `<html>` from `localStorage.theme` before paint. **Default when unset or on error is `'red'`, not light.**
- `Store` JSON-LD (`++hellohello`, Montevideo UY address).
- `openGraph.url` hardcodes `https://outfit.hellohello.is`.
- Renders `<ScrollToTop />`, children, `<BackToTop />`, `<Toaster />`.

### Component layers

- `src/components/ui/` — **48 stock shadcn/ui primitives** (`new-york`, `lucide`). **Only 2 are imported by feature code** (`toaster.tsx`, and `toast.tsx` transitively). The other 46 are unused vendor bulk. No hand-modification detected, so regenerating is safe. Feature work does not belong here.
- `src/components/outfit/` — **all product-specific UI**, 19 files. This is where feature work happens.

Intra-directory dependency graph is shallow. `Svgs.tsx` (the only file in `outfit/` without `"use client"`) is the shared leaf, consumed by `Header`, `Hero`, `Footer`, `PageLayer`, `PageTransition`. `ProductGrid` → `ProductCard` is the only parent/child pair. Everything else is a standalone leaf composed by `page.tsx`.

### Data flow — there is no server one

**Catalog.** `src/lib/outfit/products.ts` — 13 products across four exported arrays `productsRow1..4` (4/3/3/3). There is **no combined export**; every consumer re-spreads `[...productsRow1, ...productsRow2, ...productsRow3, ...productsRow4]`. Consumers: `sitemap.ts`, `product/[slug]/page.tsx`, `ProductGrid.tsx`, `ProductCard.tsx`.

```ts
export type AspectRatio = "square";
export interface Product {
  slug: string; name: string; price: string; category: string;
  frontImage: string; backImage: string; aspect: AspectRatio;
}
```

All 7 fields required. `price` is a **display string** (`"$36.50"`), not a number. There is **no size, variant, SKU, or stock field** — the size picker on the product page is UI-only, hardcoded there. `aspect: "square"` is aspirational: the source JPEGs are ~1920×2600 **portrait**, squared by CSS crop. `aspectClass()` ignores its argument entirely and returns a constant.

**Bag.** `localStorage` key `"bag"`, an array of:

```ts
interface BagItem { slug: string; name: string; price: string; image: string; size: string; qty: number }
```

`image` is always `frontImage`. The composite key is `(slug, size)`. `addToBag` (in `product/[slug]/page.tsx`) re-reads localStorage fresh and increments a matching line or pushes a new one. `updateQty` clamps to a floor of 1 — the only way to remove a line is the explicit Remove control. Totals parse the price string with `parseFloat(price.replace(/[^0-9.]/g, ""))`.

**Bag sync.** `Header.tsx` keeps the badge count live via three mechanisms: the custom `window` event `"bag-updated"`, the native `storage` event, and a **500 ms `setInterval` poll**. Note that `/bag` itself subscribes to **none** of these — see Bug 3.

**Checkout.** `handleCheckout` in `bag/page.tsx`: `preventDefault` → set `orderComplete` → `localStorage.setItem("bag", "[]")` → clear state. No validation past native `required`, no network call, no persistence.

### Hooks — `src/hooks/`

- `src/hooks/outfit/useLenis.ts` — `useLenis(enabled = true)`. Called once, from `page.tsx` as `useLenis(preloaderDone)`, so smooth scroll starts only after the intro. Skips entirely on touch devices. Constructs Lenis with `duration: 1.2` and an exponential easing, `smoothWheel: true`. **Bridges Lenis to GSAP**: `gsap.registerPlugin(ScrollTrigger)` then `lenis.on("scroll", ScrollTrigger.update)`, plus a one-shot `ScrollTrigger.refresh()` after 100 ms. Hand-rolled RAF loop. Stashes the instance on `window.__lenis` and adds a `lenis` class to `<html>`. Full cleanup on unmount.
- `src/hooks/outfit/useTheme.ts` — `{ theme, setTheme, mounted }`, `Theme = "light" | "dark" | "red"`. Reads `data-theme` off `<html>` on mount (fallback `"red"`), writes the attribute plus `localStorage.theme`. Custom — **unrelated to and incompatible with the `next-themes` package**. Single consumer: `ThemeSwitcher.tsx`.
- `src/hooks/use-mobile.ts`, `src/hooks/use-toast.ts` — stock shadcn, consumed only by the unused vendor layer. `<Toaster />` is in the live render tree but **nothing ever calls `toast()`**.

### Cross-component coupling

These string-keyed channels are the fragile seams. Renaming one breaks the other side silently.

| Channel | Producer | Consumer |
|---|---|---|
| `localStorage["bag"]` | `product/[slug]/page.tsx`, `bag/page.tsx` | `Header.tsx` |
| `window` event `"bag-updated"` | `product/[slug]/page.tsx`, `bag/page.tsx` | `Header.tsx` |
| `localStorage["theme"]` | `useTheme.ts` | layout pre-hydration script |
| `<html data-theme>` | layout script, `useTheme.ts` | all `dark:` / `red:` Tailwind variants |
| `<html class="ready">` | `Preloader.tsx` (set once, never removed) | global CSS |
| `<html class="has-custom-cursor">` | `CustomCursor.tsx` | global CSS |
| `<html class="lenis">` | `useLenis.ts` | global CSS |
| `window.__lenis` | `useLenis.ts` | ad-hoc |
| `#hero-line`, `#hero-content`, `#hero-title`, `#hero-subtitle`, `#hero-paragraph`, `#hero-link`, `#hero-shipping-returns-link`, `#hero-shipping-returns-link-mobile`, `#hero-copyright` | `Hero.tsx` (exposes, never reads) | GSAP timelines in `page.tsx` |
| `#header`, `#layer` + `.active`, `#theme-switcher (parity), .theme-control (both)`, `#page` | respective components | GSAP / global CSS |
| `.spiral-item` | `SpiralScroll.tsx` | itself, via `querySelectorAll` |

`ProductCard.tsx` sets `data-product`, `data-cursor="text"`, `data-inview="true"` — **no reader was found anywhere**. Likely vestigial; confirm before removing.

### Tuned constants

Do not casually change these — they were deliberately tuned (see `worklog.md`).

- `Preloader.tsx`: `IMAGE_START=600`, `IMAGE_INTERVAL=120`, `EXIT_TIME=2900`, `COMPLETE_TIME=3500` (reduced from 6200 for perceived load), 8000 ms safety timeout, `prefers-reduced-motion` short-circuits to 500 ms. `COUNTER_STEPS` is 10 `{delay, value}` pairs. `PRELOADER_IMAGES` and `ROTATIONS` must stay the same length.
- `TiltedCarousel.tsx`: card `CW=300 CH=300 CG=20`, pin `end: "+=6000"`, `scrub: 0.8`.
- `SpiralScroll.tsx`: radius `R=350`, spacing `VS=60`, turns `T=2.5`, pin `end: "+=6000"`, `scrub: 1`, assembly finishes at progress `0.7`.
- `PageTransition.tsx`: hold 700 ms, complete 1500 ms.
- `Header.tsx`: 500 ms bag poll. `CustomCursor.tsx`: lerp `0.22`. `BackToTop.tsx`: threshold `scrollY > 400`.

## Theming

Three themes — `light`, `dark`, `red` — selected by the **`data-theme` attribute on `<html>`**. Not a class, not `prefers-color-scheme`. Default is **`red`**.

Tailwind v4 custom variants in `src/app/globals.css` map the prefixes onto that attribute:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
@custom-variant red  (&:where([data-theme="red"],  [data-theme="red"]  *));
```

There is no `light:` variant — light is the unprefixed `:root` default. Tokens are defined three times, once per theme, as flat hex/rgba on `:root`, `[data-theme="dark"]`, `[data-theme="red"]`. Brand constants live in `@theme` (`--color-cream: #f3ecd9`, `--color-red: #122519`, `--color-black`, and `--color-white` which is **aliased to the cream hex, not `#fff`**). shadcn semantic tokens are re-exposed through `@theme inline`.

> **`tailwind.config.ts` is completely inert.** Tailwind v4 only loads a JS config when the CSS entry point declares `@config "..."`. `globals.css` has no such directive and `postcss.config.mjs` loads only `@tailwindcss/postcss`. So the file's `darkMode: "class"`, its `content` globs (which point at `./app`, `./components` — paths that don't even exist here), its `hsl(var(--x))` color wrapping, and its `tailwindcss-animate` plugin registration are **all dead**. Animations actually come from `@import "tw-animate-css"` on line 2 of `globals.css`. Editing `tailwind.config.ts` changes nothing. If you ever re-enable it, its `hsl(var(--background))` wrapping will break, because the custom properties hold hex strings, not HSL triplets.

## Adding a product

1. Produce two JPEGs named exactly `<basename>-front.jpg` and `<basename>-back.jpg`. Put them in `public/assets/products/`.
2. Append a `Product` object to one of `productsRow1..4` in `src/lib/outfit/products.ts`. All 7 fields required. `category` is `"Apparel"` for every existing product. `price` is a `"$X.XX"` string.
3. **Check `ProductGrid.tsx` before choosing a row.** Only `productsRow1` is `.map()`ed. Rows 2, 3, and 4 are indexed positionally — `productsRow2[0]/[1]/[2]` etc. — and placed with hardcoded `col-start`/`col-end` Tailwind classes. **Appending a 4th item to rows 2–4 renders nothing, silently.** To grow those rows you must also extend the grid math in `ProductGrid.tsx`.
4. A brand-new `productsRow5` would additionally need wiring into all three spread sites: `src/app/sitemap.ts`, `src/app/product/[slug]/page.tsx`, `src/components/outfit/ProductGrid.tsx`.
5. Verify slug uniqueness by hand. Nothing enforces it — `product/[slug]/page.tsx` does `.find()` and would silently resolve a duplicate to the first match.
6. `sitemap.ts` picks the product up automatically. Nothing else to update — no DB, no CMS, no cache.

The `-front`/`-back` pairing is **convention only** — no helper derives image paths from `slug`, and nothing type-checks the relationship. Today it is a verified 1:1 match: 26 references, 26 files, zero broken, zero orphans.

## Deployment pipeline

`.zscripts/*.sh` produces a tarball: Next standalone server on `:3000`, optional mini-services, and **Caddy on `:81`** as PID 1.

```
bash .zscripts/build.sh          # entrypoint; requires /home/z/my-project to exist
 ├─ mini-services-install.sh     # if mini-services/ exists
 ├─ mini-services-build.sh       #   → mini-services-dist/mini-service-<name>.js
 ├─ python-runtime-build.sh      # no-op in this repo (see below)
 ├─ database-runtime-build.sh    # copies db/ into build dir, db:push against the COPY
 └─ tar -czf /tmp/build_fullstack_$BUILD_ID.tar.gz

sh start.sh                      # deployed copy, cwd = extracted build dir
 ├─ sh ./mini-services-start.sh &
 ├─ bun next-service-dist/server.js &
 └─ exec caddy run --config Caddyfile
```

`sh .zscripts/dev.sh` is a **separate** local path — it does not call `build.sh` or `start.sh`, and it reimplements mini-service launching inline. That makes **three independent implementations** of the same idea (`mini-services-build.sh` also copies a `mini-services-start.sh` into the dist dir that `start.sh` never uses).

`Caddyfile` listens on `:81` with two routes. A request carrying `?XTransformPort=<port>` is proxied to `localhost:<port>`; everything else falls through to `localhost:3000`. Mini-services are reached **only** through this query-param proxy, never a direct port:

```
io('/?XTransformPort=3003')
```

`examples/websocket/` is the reference template for that pattern — not live code.

**The Python runtime path is inactive here.** It activates only on a root `requirements.txt`, a root `pyproject.toml`, or any `.py`/`.pyi` outside the prune list. This repo has none of the three, verified against `git ls-files` and the filesystem. `tests/python-runtime-*.sh` exercise it against synthetic fixtures only.

## Traps

Verified against the current tree.

1. **`next build` runs neither the type checker nor ESLint.** `next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, and `tsconfig.json` sets `noEmit: true` (so `tsc` is a checker only, never invoked by the build). A green build proves nothing. Run `bun x tsc --noEmit` and `bun run lint` separately.
2. **`eslint.config.mjs` disables nearly every rule.** It extends `next/core-web-vitals` + `next/typescript` and then explicitly turns off most TS-strictness, react-hooks, and JS-correctness categories. A clean lint run is weak evidence.
3. **`strict: true` but `noImplicitAny: false`.** Untyped parameters silently become `any` while every other strict check is on. `target` is `ES2017`. Only one path alias exists: `@/*` → `src/*`.
4. **`tailwind.config.ts` is dead.** See [Theming](#theming). Editing it changes nothing.
5. **`.env`'s `DATABASE_URL` is a hardcoded Linux path** (`file:/home/z/my-project/db/custom.db`) from the origin sandbox. It does not exist on Windows — override it before any Prisma command. The same `/home/z/my-project` assumption is baked into `build.sh`, `start.sh`, `mini-services-*.sh`, and `scripts/download-products.sh`. `dev.sh` is the one portable exception.
6. **Prisma is dead code.** `schema.prisma` defines generic `User`/`Post` starter models with no real relation. `src/lib/db.ts` exports a `PrismaClient` singleton that **nothing under `src/` imports**. These models do not reflect the domain. `db/custom.db` is committed to git.
7. **No `prisma/migrations/`.** Apply schema changes with `bun run db:push`. Never `prisma migrate dev` — `db:migrate`/`db:reset` exist but are unused and would diverge from how dev and build actually provision the DB.
8. **Images are `unoptimized: true` deliberately.** `/_next/image` was measured as a 7s+ blocking bottleneck; disabling it cut idle memory 278 MB → 99 MB. Do not "fix" this. Consequence: `images.formats: ["image/avif","image/webp"]` in the same config is **inert**, and `sharp` is an unused dependency.
9. **GSAP is NOT lazy-loaded, despite the worklog convention.** `TiltedCarousel.tsx` and `SpiralScroll.tsx` both `import gsap from "gsap"` at module scope. The real rule from `worklog.md` was narrower: avoid `next/dynamic` on scroll *components* (it caused `insertBefore`/`removeChild` DOM mutation errors). Match the sibling files' actual pattern; flag the discrepancy rather than silently "fixing" either side.
10. **`reactStrictMode: false`.** No double-invoked effects in dev, so cleanup bugs will not surface on their own. Also set: `devIndicators: false`, `compress: true`, `optimizePackageImports: ["gsap","lenis","@number-flow/react"]`, `staticPageGenerationTimeout: 120`.
11. **`.zscripts/build.sh` self-mutates `next.config.ts`** — if a build doesn't produce `.next/standalone/server.js`, it `perl`-injects `output: "standalone"`, backs up to `.zbak`, and rebuilds. It also reads `BUILD_ID` with **no default and no `set -u`**, so an unset `BUILD_ID` makes the build dir literally `/tmp/build_fullstack_` — a collision across runs.
12. **`upload/` is ~190 MB of git-tracked build-session artifacts**, dominated by two screen recordings (108 MB and 79 MB) plus screenshots and briefs. `download/` is the same category at 21 KB. Nothing in `src/` reads either. That weight is permanent in `.git` history. `.gitignore` covers neither, nor `db/`, nor `*.mp4`. It *does* ignore `.claude` and `/skills/`.
13. **The domain `https://outfit.hellohello.is` is hardcoded in three independent places** — `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/layout.tsx` (`openGraph.url`). Changing it means editing all three.
14. **`bun run build` fails on Windows at the copy step.** The `build` script ends with `cp -r .next/static ... && cp -r public ...`, but Bun's built-in shell rejects `cp -r` with `cp: illegal option -- r`. `next build` itself succeeds; only the copy fails, and the script exits 1. Finish it by hand in Git Bash:

    ```bash
    mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
    ```

    Verify by count, not by `ls -d` — the directories can exist while empty: `find .next/standalone/public -type f | wc -l` should be 43, and `.next/standalone/.next/static` should hold 27.

15. **`bun run dev`'s fallback branch destroys the copied assets.** When `.next/standalone/server.js` or `.next/BUILD_ID` is missing it runs the build, and `next build` regenerates `.next/` from scratch — deleting any previously copied `static`/`public`. It then dies on the `cp -r` of Trap 14, so you are left with no server *and* stripped assets. Symptom: the app returns HTTP 200 for every route while every asset 404s. To run locally, build once, copy by hand, then start the server directly with `node .next/standalone/server.js` rather than going through `bun run dev`.

16. **`outputFileTracingRoot` must stay pinned.** Next infers the workspace root by walking up for a `package.json`/lockfile. On this machine there are stray ones at `C:\Users\serge\Desktop\ARTCOVR` and `C:\Users\serge`, so Next picked the outermost and emitted the app at `.next/standalone/Desktop/ARTCOVR/.claude/worktrees/<branch>/server.js` instead of a flat `.next/standalone/server.js`. Both the `build` script and `.zscripts/build.sh` assume the flat layout — and build.sh reacts to the missing file by triggering its `next.config.ts` self-mutation (Trap 11). `next.config.ts` now sets `outputFileTracingRoot: __dirname` to prevent this. Do not remove it. (`__dirname` is valid here: `package.json` has no `"type": "module"`.)

17. **The user-level `C:\Users\serge\CLAUDE.md` describes a different codebase** (a CRE underwriting engine with `src/engine/`, `firpta.ts`, `covenantCheck.ts`, and a `graphify-out/` graph). None of that exists here. Ignore it when working in this repo.

## Known bugs

Found by audit, not yet fixed. Do not treat as intentional.

1. **`/api/health` is frozen at build time.** It exports `dynamic = "force-static"` while its body computes `Date.now()` and `process.uptime()`. Those are evaluated once during the build and served as constants, defeating the point of a health check.
2. **A CSS rule never applies.** `globals.css:23` — `#header>div:where([data-theme="red"]*)`. The `[data-theme="red"]*` fragment is missing a descendant combinator, so the parser drops the rule. Probably intended `[data-theme="red"] *`.
3. **`/bag` desyncs across tabs and clobbers concurrent writes.** It subscribes to neither `storage` nor `bag-updated`, so a second tab's changes never reach it. Worse, `updateQty` and `removeItem` derive the next value from React state rather than re-reading `localStorage`, so any external write between mount and click is silently overwritten. `addToBag` does re-read, and is therefore safer.
4. **`bag/page.tsx` breaks the try/catch convention.** Only its mount effect is guarded. `removeItem`, `updateQty`, and `handleCheckout` will throw uncaught if `localStorage` is unavailable. Item shape is never validated beyond `Array.isArray`, so a corrupt entry produces `NaN` totals.
5. **`Footer.tsx` leaks a timer.** The 4000 ms `setTimeout` in `subscribe()` is never captured or cleared — the only uncleaned timer in `src/components/outfit/`.
6. **`ErrorBoundary` fails invisibly by default.** `fallback` is optional and defaults to `null`, so a crashed widget simply disappears with only a `console.error`. It also has no reset path — once tripped it stays failed until the parent remounts it via a `key` change, which nothing does.

## Dead code inventory

Knowing what is dead prevents inferring patterns that do not exist.

**Unused dependencies** (zero imports across `src/`, `scripts/`, `examples/`): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers`, `@mdxeditor/editor`, `@reactuses/core`, `@tanstack/react-query`, `@tanstack/react-table`, `date-fns`, `next-auth`, `react-markdown`, `react-syntax-highlighter`, `sharp`, `uuid`, `z-ai-web-dev-sdk`, `zod`, `zustand`. Plus `tailwindcss-animate`, imported only by the inert `tailwind.config.ts`.

**Do not infer validation from `zod` or auth from `next-auth`.** Neither is used.

**Unused code:**

- 46 of 48 `src/components/ui/` primitives have no importer outside that directory.
- `cn()` in `src/lib/utils.ts` is called only by the vendor layer, never by `src/app` or `src/components/outfit`.
- `src/lib/db.ts` — no importers.
- `src/lib/outfit/paths.ts` — runtime never touches it; only `scripts/gen-og-image.ts` consumes it. Its contents are machine-exported vector coordinates: safe to reformat, **never hand-edit the path data**.
- `src/components/ui/sonner.tsx` imports `useTheme` from the **`next-themes` package** — a different, incompatible hook from `src/hooks/outfit/useTheme.ts`. Inert today because nothing imports `sonner.tsx`, but a landmine if wired up.
- `use-toast` plumbing is rendered but never triggered.
- `.zscripts/dev.pid` — a tracked file containing a stale PID, read by nothing.
- `FullScreenSnap.tsx` appears unwired into the page composition.

**Generated — do not hand-edit:** `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png` (from `scripts/gen-icons.ts`), `public/og-image.png` (from `scripts/gen-og-image.ts`). `public/favicon.ico` is **not** generated by either script.

## Conventions for new code

Inferred from patterns held consistently across `src/components/outfit/`.

1. Start every file in `outfit/` with `"use client"`. `Svgs.tsx` is the sole server-eligible exception, because it is a pure prop-driven leaf.
2. **Every effect that registers a listener, timer, observer, or GSAP instance must return a cleanup that undoes it.** 15 of 16 effect-bearing files do this correctly; `Footer.tsx` is the outlier. Do not copy it.
3. Wrap risky DOM/browser calls (`localStorage`, GSAP init, layout measurement) in `try/catch` with `console.error` rather than throwing.
4. Throttle scroll and resize work through `requestAnimationFrame`, guarded by a single in-flight `rafId` — see `ScrollProgress.tsx` and `FullScreenSnap.tsx`.
5. For continuously animated values, set `style.transform` / `style.opacity` directly rather than re-rendering className strings each frame.
6. For cross-component state, use the sanctioned channel: `localStorage` plus a custom `window` event, paired with a native `storage` listener. Do not invent a new global.
7. Respect `prefers-reduced-motion` on any new intro or scroll-hijacking animation. `Preloader.tsx` is the reference implementation.
8. **Wrap every new homepage section in its own `ErrorBoundary` with a unique `label`,** and pass an explicit `fallback` if silent disappearance is not acceptable.
9. New ids and classes intended as animation hooks are effectively public API. Grep the whole repo before renaming one — `Hero.tsx`'s nine `#hero-*` ids have no readers in their own file.

## Design intent

The single-page scroll structure is intentional — splitting sections into routes was considered and rejected. Carousel and spiral showcases run 26 items, built from the front and back images of the 13 products.

## Agent skills

### Issue tracker

Local markdown — issues and PRDs live under `.scratch/<feature-slug>/`. There is no git remote, so `gh`/`glab` commands do not apply. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), applied as a `Status:` line in the issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. Neither exists yet; that is expected. See `docs/agents/domain.md`.

# COMPREHENSIVE AUDIT: 55 Mistakes + 55 Improvements + Hallucination Audit

## 55 MISTAKES

### Project Management (1-10)
1. **Project wiped multiple times** — Source files disappeared at least 3 times during the conversation, requiring full rebuilds each time. Never identified the root cause (likely sandbox memory resets).
2. **Kept building on unstable foundation** — Instead of verifying the base was solid, kept adding features (Three.js, 260 carousel items, multiple scroll animations) that caused memory crashes.
3. **Didn't backup files** — Never created a backup of working code before making changes, so when files got corrupted or wiped, everything was lost.
4. **Overwrote layout.tsx with wrong project** — At some point, layout.tsx was overwritten with "SERGEY / EDITIONS" configuration, introducing wrong title, 3 extra Google Fonts (causing OOM), wrong theme, wrong colors.
5. **Overwrote globals.css with wrong project** — Same corruption issue — globals.css was replaced with SERGEY/EDITIONS palette, missing `@custom-variant red`, missing `[data-theme="red"]` block.
6. **Introduced foreign file** — `src/lib/artworks.ts` from the SERGEY project was created in the codebase.
7. **Didn't verify after external operations** — After running init scripts or other operations, didn't check if existing files were preserved.
8. **Used dev mode instead of production** — Ran `next dev` (1.6GB RAM) instead of `next build` + `next start` (120MB RAM), causing OOM kills throughout most of the conversation.
9. **Installed unnecessary packages** — `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` were installed and later removed, wasting time and causing memory issues.
10. **Didn't account for 4GB RAM limit** — Designed features (260 carousel items, Two.js WebGL contexts) that were impossible to run in the sandbox environment.

### Preloader/Intro Animation (11-20)
11. **Wrong counter position** — Put counter in top-right corner, then center of screen. Original positions it relative to SVG at `top-[-40%] left-[105%]`.
12. **Wrong counter class** — Used `text-cream/70`, `tabular-nums`, `font-bold`. Original uses `dark:text-red text-cream block text-right` with no extra classes.
13. **Wrong counter timing** — Multiple wrong timing schedules throughout. Original holds at 000 for ~2.5s, then specific non-linear progression to 100.
14. **Wrong image entry animation** — Used slide-in, animated rotation, framer-motion springs. Original uses simple scale 0→1 with static rotation.
15. **Wrong image stacking** — Made images cycle one at a time. Original stacks all visible simultaneously.
16. **Wrong OUTFIT text treatment** — Used SVG mask, solid fill, wrong positioning. Original uses `fill-cream` + `mix-blend-difference` + `dark:mix-blend-multiply`.
17. **Wrong exit transition** — Used shutter close, fade, slide-up at various points. Original is cream wipe UP from bottom (clip-path inset).
18. **Removed preloader from DOM** — Original keeps preloader in DOM with `clip-path: inset(0% 0% 100%)`. Mine returned null.
19. **Missing `ready` class** — Forgot to add `ready` class to `<html>` in multiple iterations, which broke header/theme-switcher CSS reveal.
20. **Wrong preloader class** — Missing `gap-8`, `dark:bg-cream`, `dark:text-black` from the preloader container class.

### Product Cards (21-28)
21. **VIEW MORE badge hallucination** — Added a VIEW MORE badge based on vision model analysis. DOM inspection of original confirmed it doesn't exist. Then removed it. Then re-added it based on video analysis. The badge does NOT exist on the original site.
22. **Wrong product card structure** — Put placeholder as first child instead of last. Original has: front img → back img → placeholder (last child).
23. **Added `product-card` class** — Invented a class that doesn't exist in the original.
24. **Wrong product href** — Used `#product-{slug}` (anchor) instead of `/product/{slug}` (real route).
25. **Wrong grid wrapper structure** — Put col-span classes directly on `<a>` instead of wrapper `<div>` elements.
26. **Front image z-index issues** — Added `relative z-10` which original doesn't have. Original works because images are opaque and DOM order handles stacking.
27. **Back image duplicate `object-cover`** — The `.replace()` chain in the className template caused `object-cover` to appear twice.
28. **Back image missing `aspect-large`** — The `.replace()` chain stripped the aspect class.

### Cursor (29-32)
29. **Wrong cursor scaling** — Made cursor scale to 2rem on hover. Original is always `h-2 w-2` (8px), never scales.
30. **Wrong cursor color logic** — Changed cursor color based on hover target. Original is always `var(--color-red)` globally.
31. **Used `cursor-dot` class** — Invented a class that doesn't exist in the original. Original uses `pointer-events-none fixed top-0 left-0 z-[9999]`.
32. **Wrong cursor structure** — Used 2-div nesting instead of the original's 3-div nesting (`div > div > div.h-2.w-2`).

### Theme Switcher (33-35)
33. **Added fake theme transition** — Built elaborate 3-phase transition (black overlay → OUTFIT mask → colored bar). Original is instant CSS variable swap.
34. **Wrong button order** — Changed order to Red, Dark, Cream at one point. Original is Dark, Cream, Red.
35. **Extra transition classes on indicator** — Added `transition-transform duration-500 ease-out` which original doesn't have.

### Colors & Fonts (36-40)
36. **Wrong font weight mapping** — Had Medium→500, Bold→700. Original maps Medium→700, Bold→800.
37. **Wrong font-size** — Used 18px. Original uses 16px.
38. **Added `antialiased` to body** — Original doesn't have this class.
39. **Wrong header color** — Used `#12e4dc` (close but wrong). Original uses `oklab(0.73 -0.14 -0.1)` which resolves differently.
40. **Missing `#header > div:where([data-theme=red] *)` CSS rule** — Original has this to set header inner div color to `#12e4dc` in red theme.

### Scroll Animations (41-48)
41. **Carousel OOM from 260 items** — User asked for 10x more images, I created 260 cards at 400px each, causing OOM kills.
42. **Wrong carousel layout** — Used 3D tilted perspective when Image 1 reference shows flat horizontal row.
43. **Wrong spiral implementation** — Used expanding flat spiral, then CSS helix, then Three.js helix — all had issues.
44. **Three.js integration caused crashes** — Loading 39 WebGL textures simultaneously caused OOM.
45. **Multiple ScrollTrigger instances** — Each scroll component created its own ScrollTrigger, compounding memory usage.
46. **FullScreenSnap fixed elements on all sections** — Marquee and pill nav used `position: fixed`, showing on ALL sections not just snap section.
47. **Reduced scroll distances as "fix"** — Instead of solving the memory problem, reduced carousel from 50000px to 3000px, which is not what the user wanted.
48. **Used framer-motion in carousel** — Added unnecessary dependency that conflicted with GSAP pinning.

### Hero & Page Structure (49-55)
49. **Wrong hero entrance animation** — Used GSAP scale-in wordmark, scaleX line, staggered content. Original is static reveal with no animations.
50. **Wrong hero shipping link** — Used `#shipping` instead of `/shipping-and-return`.
51. **Missing `@theme inline` block** — Original CSS has this mapping all color variables. Mine was missing.
52. **Missing `--radius` variable** — `--radius: 0.625rem` absent from `:root`.
53. **Missing `html[data-theme=light/dark]` color-scheme rules** — `color-scheme` property not set.
54. **Wrong PageLayer clip-path** — Used `inset(50% 0 50% 0)`. Original is `inset(100% 0% 0% 0%)`.
55. **Wrong body class order** — Had `text-black` before `selection:bg-red`. Original has `selection:bg-red` before `text-black`.

---

## 55 IMPROVEMENTS

### Architecture (1-10)
1. **Use production build always** — Change `dev` script to `next build && next start` permanently to avoid 1.6GB dev server memory usage.
2. **Create file backup system** — Before any code changes, copy all files to a `.backup` directory.
3. **Use incremental feature additions** — Add one feature, verify it works, then add the next. Never add 5 things at once.
4. **Memory budget planning** — Before adding features, calculate expected memory: server + Chrome + page content < 3GB (leave 1GB buffer).
5. **Use dynamic imports for heavy components** — Load TiltedCarousel, SpiralScroll, FullScreenSnap only when scrolled near them.
6. **Virtualize long lists** — For 260 carousel items, use windowing/virtualization to only render visible cards.
7. **Use CSS transforms instead of JS animations** — Where possible, use CSS animations instead of GSAP to reduce JS memory.
8. **Lazy-load images with IntersectionObserver** — Don't rely on Next.js Image alone; add explicit IO-based loading for scroll sections.
9. **Separate scroll sections into routes** — Instead of one massive page, use route-based splitting so each section is a separate page.
10. **Use static export** — Since the site is mostly static, use `next export` for zero server memory.

### Preloader (11-18)
11. **Extract preloader timing to config** — Make counter steps, image timing, exit delay configurable constants.
12. **Preload images with `preload` link** — Add `<link rel="preload">` for preloader images in the HTML head.
13. **Use requestAnimationFrame for counter** — Instead of setTimeout chain, use rAF for smoother counter animation.
14. **Add error handling for image loading** — If preloader images fail to load, skip to hero after timeout.
15. **Add `prefers-reduced-motion` support** — Skip preloader animation entirely for users who prefer reduced motion.
16. **Use Web Workers for counter** — Move counter logic to a Web Worker to avoid blocking the main thread.
17. **Cache preloader state** — Use sessionStorage to skip preloader on subsequent visits in same session.
18. **Add loading progress bar** — Show a visual progress bar during preloader for better UX.

### Product Cards (19-26)
19. **Use CSS `content-visibility: auto`** — Apply to off-screen product cards for rendering performance.
20. **Add `will-change: transform` to hover elements** — Optimize the clip-path hover animation.
21. **Use `aspect-ratio` CSS property directly** — Instead of Tailwind aspect classes, use inline `style={{ aspectRatio: '1/1' }}`.
22. **Add image error fallback** — If product image fails to load, show a branded placeholder.
23. **Implement lazy hover** — Only attach hover listeners when card is in viewport.
24. **Use `loading="lazy"` on all non-critical images** — Already using Next.js Image, but ensure all below-fold images are lazy.
25. **Add image blur-up placeholder** — Use Next.js `placeholder="blur"` for smooth image loading.
26. **Group product data in a single export** — Instead of 4 separate arrays, use one array with section grouping.

### Scroll Animations (27-36)
27. **Use CSS Scroll-Driven Animations** — Modern browsers support `animation-timeline: scroll()` which needs no JS.
28. **Implement virtual scrolling for carousel** — Only render 7-10 cards at a time, recycle DOM nodes.
29. **Use `IntersectionObserver` instead of ScrollTrigger** — For simple reveal animations, IO is lighter than GSAP.
30. **Debounce scroll events** — Use `requestAnimationFrame` debouncing for scroll handlers.
31. **Use `position: sticky` instead of GSAP pin** — CSS sticky positioning uses less memory than GSAP pinning.
32. **Implement snap scrolling natively** — Use CSS `scroll-snap-type` instead of JS-based snapping.
33. **Add scroll progress indicator** — Show a thin progress bar at top showing scroll position.
34. **Use transform3d for GPU acceleration** — Ensure all scroll animations use `translate3d` for GPU compositing.
35. **Pre-calculate spiral positions** — Compute all card positions once at init, not every frame.
36. **Add touch gesture support** — For mobile, add swipe gestures for carousel navigation.

### Performance (37-44)
37. **Use `next/image` with proper sizes** — Add accurate `sizes` attribute to all images for optimal loading.
38. **Implement code splitting** — Split outfit components into separate chunks loaded on demand.
39. **Use `React.memo` for product cards** — Prevent unnecessary re-renders when scrolling.
40. **Add service worker** — Cache static assets for instant subsequent loads.
41. **Use `font-display: swap`** — Already using this, but ensure all font weights have it.
42. **Minimize CSS** — Remove unused shadcn/ui component styles that aren't needed.
43. **Use `preload` for critical CSS** — Inline critical above-the-fold CSS for faster FCP.
44. **Add `prefetch` for next sections** — When user is in hero, prefetch carousel images.

### UX/Design (45-55)
45. **Add keyboard navigation** — Arrow keys for carousel, Tab for products, Enter for product detail.
46. **Add focus indicators** — Visible focus rings on all interactive elements for accessibility.
47. **Add ARIA labels** — Proper `aria-label`, `role`, `aria-live` for dynamic content.
48. **Add reduced-motion fallbacks** — Static versions of all animations for `prefers-reduced-motion`.
49. **Add dark mode color scheme meta** — `<meta name="color-scheme" content="light dark">` in head.
50. **Add Open Graph images** — Social media preview images for sharing.
51. **Add structured data** — JSON-LD for products, organization, website.
52. **Add sitemap.xml** — For SEO crawling.
53. **Add error boundaries** — React error boundaries around each section so one failure doesn't break the page.
54. **Add loading states** — Suspense fallbacks for each dynamically imported section.
55. **Add analytics** — Track scroll depth, section views, product clicks, theme switches.

---

## HALLUCINATION AUDIT

### Claims That Were Wrong (Hallucinations)

1. **"VIEW MORE badge exists on the original site"** — HALLUCINATION. Vision model said it saw a red circular "VIEW MORE" badge on product hover. DOM inspection confirmed `hasViewMore: false`. I added the badge, then removed it, then re-added it based on video analysis. The badge does NOT exist on the original site.

2. **"Three.js will work in this environment"** — HALLUCINATION. I claimed Three.js would work for 3D scroll animations. It caused OOM crashes every time because WebGL contexts + texture loading exceeded 4GB RAM limit.

3. **"260 carousel items will work"** — HALLUCINATION. User asked for 10x more images. I created 260 cards at 400px each, claiming it would work. It caused immediate OOM crashes.

4. **"The intro animation starts at frame 0 with images"** — HALLUCINATION. I initially claimed the preloader started showing images immediately. Frame analysis at 60fps revealed the first ~2.5 seconds are ALL BLACK with just the "000" counter.

5. **"The exit is a shutter close"** — HALLUCINATION. I described the preloader exit as "black bars closing from top and bottom simultaneously." Frame analysis showed it's actually a cream wipe UP from bottom.

6. **"The hero wordmark scales in from 2.4x"** — HALLUCINATION. I built an elaborate GSAP animation for the hero entrance. The original reveals the hero STATICALLY — no scale, no line animation, no stagger.

7. **"The theme switch has a 3-phase transition"** — HALLUCINATION. I built an elaborate transition (black overlay → OUTFIT mask with cycling images → colored bar rises from bottom). The original theme switch is INSTANT — just a CSS variable swap.

8. **"Counter starts at 000 and immediately increments"** — HALLUCINATION. I initially had the counter start incrementing immediately. Frame analysis showed it holds at 000 for ~2.5 seconds before any increment.

9. **"The cursor changes color on hover"** — HALLUCINATION. I implemented cursor color changes based on hover target (red on products, foreground otherwise). The original cursor is ALWAYS red (`--cursor-color: var(--color-red)` set globally once).

10. **"The cursor scales on hover"** — HALLUCINATION. I made the cursor scale to 2rem (32px) with 30% opacity when hovering products. The original cursor is always `h-2 w-2` (8px), never scales.

11. **"30fps frame extraction is sufficient"** — HALLUCINATION. I extracted video frames at 30fps and based all timing on that. The original video is 60fps, so all my timing was off by 2x. Had to re-extract at 60fps.

12. **"The font size is 18px"** — HALLUCINATION. I used 18px for `html { font-size }`. The original uses 16px. This was caught during the detailed audit.

13. **"Medium maps to weight 500"** — HALLUCINATION. I mapped NeueHaasGroteskTextPro_Medium.woff2 to weight 500. The original maps it to weight 700. Bold maps to 800, not 700.

14. **"The page transition on product click exists"** — PARTIAL HALLUCINATION. Video analysis showed a full-screen color transition when clicking a product. However, this might be a navigation transition, not a custom page transition component. I built a PageTransition component that may not match the original behavior.

15. **"The counter is in the top-right corner"** — HALLUCINATION. I initially placed the counter in the top-right corner of the screen. The original positions it relative to the SVG at `top-[-40%] left-[105%]`.

16. **"Lenis is not needed"** — HALLUCINATION. During memory optimization, I removed Lenis to save memory. The original site HAS Lenis (`html.lenis` class present). I later added it back.

17. **"The `antialiased` class is needed"** — HALLUCINATION. I added `antialiased` to the body class. The original doesn't have it.

18. **"Production build doesn't need the dev script"** — PARTIAL HALLUCINATION. I changed the `dev` script to run production build. But the system's auto-dev script expects `bun run dev` to start a server, and the build step takes time, causing initial load delays.

19. **"The preloader images cycle one at a time"** — HALLUCINATION. I implemented image cycling (one image visible at a time, replacing the previous). The original stacks ALL images simultaneously — they don't replace each other.

20. **"The back image `aspectClass` replace chain works correctly"** — HALLUCINATION. I used `.replace()` chain to strip classes from the aspect string, but it caused duplicate `object-cover` and stripped `aspect-large`. Had to fix with direct ternary logic.

---

## SUMMARY

- **55 Mistakes**: Project management failures (10), Preloader errors (10), Product card errors (8), Cursor errors (4), Theme switcher errors (3), Color/font errors (5), Scroll animation errors (8), Hero/page structure errors (7)
- **55 Improvements**: Architecture (10), Preloader (8), Product cards (8), Scroll animations (10), Performance (8), UX/Design (11)
- **20 Hallucinations**: VIEW MORE badge, Three.js feasibility, 260 items, intro timing, exit transition, hero animation, theme transition, counter behavior, cursor behavior, frame rate, font size, font weights, page transition, counter position, Lenis necessity, antialiased class, dev script, image cycling, replace chain, shutter close

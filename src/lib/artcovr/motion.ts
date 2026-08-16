/*
 * Two gates, not one.
 *
 * The scroll journey — the home page, Lenis, and the journey components — flips
 * to its static fallback when STATIC_MEDIA_QUERY matches (reduced motion, coarse
 * pointer, or a window narrower than 768px). Those motion layers must answer
 * IDENTICALLY, or a fine-pointer desktop shrunk below 768px leaves the page with
 * motion disabled but the layers still rendering their layered (disabled,
 * inert) stage — a frozen first card.
 *
 * The intro (Preloader) is gated by REDUCED_MOTION_QUERY only. Touch and narrow
 * screens keep the experience — they reach the static scroll journey through
 * STATIC_MEDIA_QUERY above — so the preloader itself must NOT bail on a coarse
 * pointer or a narrow viewport. `prefers-reduced-motion: reduce` still bypasses
 * the intro instantly.
 *
 * Keep the literal in Preloader / PageTransition inline so the motion contract
 * test can scan them by source; everything else imports from here.
 */
export const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/*
 * One scroll-engine gate for every motion layer.
 *
 * The home page flips the whole journey to its static fallback when this query
 * matches (reduced motion, coarse pointer, or a window narrower than 768px).
 * The motion layers must answer IDENTICALLY, or a fine-pointer desktop shrunk
 * below 768px leaves the page with motion disabled but the layers still
 * rendering their layered (disabled, inert) stage — a frozen first card.
 *
 * Keep the literal in Preloader / PageTransition inline so the motion contract
 * test can scan them by source; everything else imports from here.
 */
export const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";

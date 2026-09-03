/* Accessibility reduced motion contract */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/* Eligibility contract for scroll-driven motion and heavy parallax layers. */
export const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";

/* The intro can run on mobile; only explicit reduced-motion opts out. */
export const PRELOADER_STATIC_MEDIA_QUERY = REDUCED_MOTION_QUERY;

export const PRELOADER_COMPLETE_TIME_MS = 4900;
export const PRELOADER_FAILSAFE_TIME_MS = 6000;


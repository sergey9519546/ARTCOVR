/* Accessibility reduced motion contract */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/* Eligibility contract for scroll-driven motion and heavy parallax layers. */
export const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";

export const PRELOADER_COMPLETE_TIME_MS = 4900;
export const PRELOADER_FAILSAFE_TIME_MS = 6000;


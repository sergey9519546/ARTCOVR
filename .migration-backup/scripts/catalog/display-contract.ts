/**
 * The public display derivative contract, in one place.
 *
 * Every path that writes a file into public/assets/artworks must agree on this
 * bound. They did not before: `finalize-owner-approved-batch.ts` hard-required
 * exactly 1024x1024, the PowerShell renderers targeted 1024, and
 * `swap-launch-works.ts` preserved source dimensions — so a work's preview
 * resolution depended on which intake path it happened to arrive through.
 *
 * Protection for a public preview is the lossy re-encode (storefront displays
 * carry no visible watermark since the owner decision of 2026-08-28). The
 * ceiling bounds how much resolution a free preview may carry; it is NOT a
 * source gate. Sources are separately required to be square and >= 1024 —
 * do not confuse the two numbers.
 */
export const PUBLIC_DISPLAY_MAX_DIMENSION = 1280;

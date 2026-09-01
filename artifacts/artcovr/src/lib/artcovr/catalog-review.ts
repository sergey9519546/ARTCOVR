import curatedReview from "./curated-review.json" with { type: "json" };

/**
 * The review catalog JSON is the maintained source of truth for its size.
 * Keeping this derived value in the helper module preserves the existing
 * catalog checks without duplicating a manually maintained count.
 */
export const LAUNCH_REVIEW_SIZE = (curatedReview as unknown[]).length;
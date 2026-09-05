const terminalCheckoutCodes = new Set([
  "checkout_unavailable",
  "checkout_attach_failed",
  "checkout_snapshot_mismatch",
  "idempotency_conflict",
  "idempotency_expired",
  "invalid_checkout_amount",
  "stripe_checkout_failed",
  "stripe_checkout_invalid",
]);

const unavailableSelectedPreviewCodes = new Set([
  "generation_not_found",
  "invalid_selected_preview",
  "selected_preview_unavailable",
]);

export function shouldRotateCheckoutKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    terminalCheckoutCodes.has(error.code)
  );
}

export const shouldRotateCheckoutIdempotencyKey = shouldRotateCheckoutKey;

export function shouldDiscardSelectedPreview(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    unavailableSelectedPreviewCodes.has(error.code)
  );
}

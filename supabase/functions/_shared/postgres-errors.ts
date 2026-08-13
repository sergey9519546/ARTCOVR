import { HttpError } from "./errors.ts";

type PostgresErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const knownErrors: Array<{
  token: string;
  status: number;
  code: string;
  message: string;
}> = [
  { token: "invalid_prompt", status: 400, code: "invalid_prompt", message: "Prompt must contain 1–12,000 characters." },
  { token: "reset_reference_conflict", status: 400, code: "reset_reference_conflict", message: "Reset cannot be combined with a result reference." },
  { token: "generation_global_rate_limited", status: 429, code: "generation_rate_limited", message: "Image generation is temporarily busy. Try again shortly." },
  { token: "generation_rate_limited", status: 429, code: "generation_rate_limited", message: "Too many generation attempts. Try again in a few minutes." },
  { token: "generation_daily_limit", status: 429, code: "generation_daily_limit", message: "The daily generation-attempt limit has been reached." },
  { token: "generation_allowance_exhausted", status: 409, code: "generation_allowance_exhausted", message: "No successful generation allowance remains." },
  { token: "generation_in_progress", status: 409, code: "generation_in_progress", message: "Another generation is already running for this artwork." },
  { token: "preview_current_reference_required", status: 409, code: "current_result_required", message: "Continue from the current result or use Reset." },
  { token: "reference_is_not_current", status: 409, code: "reference_is_not_current", message: "That result is no longer the current editing source." },
  { token: "generation_reference_expired", status: 409, code: "generation_reference_expired", message: "That generated result has expired." },
  { token: "invalid_generation_reference", status: 403, code: "invalid_generation_reference", message: "That generated result is not available to this account." },
  { token: "reference_belongs_to_another_purchase", status: 403, code: "invalid_generation_reference", message: "That result belongs to a different purchase." },
  { token: "reference_is_not_selected_preview", status: 403, code: "invalid_generation_reference", message: "That preview is not the one attached to this purchase." },
  { token: "preview_cannot_reference_purchased_result", status: 403, code: "invalid_generation_reference", message: "A preview cannot use a purchased result as its source." },
  { token: "selected_preview_unavailable", status: 409, code: "selected_preview_unavailable", message: "The selected preview is no longer available." },
  { token: "invalid_selected_preview", status: 409, code: "invalid_selected_preview", message: "The selected preview is invalid or no longer current." },
  { token: "purchase_not_entitled", status: 403, code: "purchase_not_entitled", message: "This purchase no longer has generation access." },
  { token: "artwork_not_generation_ready", status: 409, code: "artwork_not_generation_ready", message: "This artwork is not available for generation." },
];

export function postgresHttpError(
  error: PostgresErrorLike,
  fallback: { status: number; code: string; message: string },
) {
  const source = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const known = knownErrors.find(({ token }) => source.includes(token));
  console.error("Postgres operation failed", {
    code: error.code ?? "unknown",
    classification: known?.code ?? fallback.code,
  });
  return new HttpError(
    known?.status ?? fallback.status,
    known?.code ?? fallback.code,
    known?.message ?? fallback.message,
  );
}

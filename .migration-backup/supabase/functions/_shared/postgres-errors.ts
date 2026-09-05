import { HttpError } from "./errors.ts";

type PostgresErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

// Classification is deliberately narrow: the SQLSTATE the RPC raised with, plus
// the exact token as a standalone word in the error message. `details` and
// `hint` are attacker- or data-influenced free text (row values, constraint
// payloads) and must never be able to promote an unrelated failure into a
// friendlier status code.
const knownErrors: Array<{
  token: string;
  sqlstate: string;
  status: number;
  code: string;
  message: string;
}> = [
  { token: "invalid_prompt", sqlstate: "22023", status: 400, code: "invalid_prompt", message: "Prompt must contain 1–12,000 characters." },
  { token: "reset_reference_conflict", sqlstate: "22023", status: 400, code: "reset_reference_conflict", message: "Reset cannot be combined with a result reference." },
  { token: "generation_global_rate_limited", sqlstate: "P0001", status: 429, code: "generation_rate_limited", message: "Image generation is temporarily busy. Try again shortly." },
  { token: "generation_rate_limited", sqlstate: "P0001", status: 429, code: "generation_rate_limited", message: "Too many generation attempts. Try again in a few minutes." },
  { token: "generation_daily_limit", sqlstate: "P0001", status: 429, code: "generation_daily_limit", message: "The daily generation-attempt limit has been reached." },
  { token: "generation_allowance_exhausted", sqlstate: "P0001", status: 409, code: "generation_allowance_exhausted", message: "No successful generation allowance remains." },
  { token: "generation_in_progress", sqlstate: "P0001", status: 409, code: "generation_in_progress", message: "Another generation is already running for this artwork." },
  { token: "preview_current_reference_required", sqlstate: "22023", status: 409, code: "current_result_required", message: "Continue from the current result or use Reset." },
  { token: "reference_is_not_current", sqlstate: "22023", status: 409, code: "reference_is_not_current", message: "That result is no longer the current editing source." },
  { token: "generation_reference_expired", sqlstate: "42501", status: 409, code: "generation_reference_expired", message: "That generated result has expired." },
  { token: "invalid_generation_reference", sqlstate: "42501", status: 403, code: "invalid_generation_reference", message: "That generated result is not available to this account." },
  { token: "reference_belongs_to_another_purchase", sqlstate: "42501", status: 403, code: "invalid_generation_reference", message: "That result belongs to a different purchase." },
  { token: "reference_is_not_selected_preview", sqlstate: "42501", status: 403, code: "invalid_generation_reference", message: "That preview is not the one attached to this purchase." },
  { token: "preview_cannot_reference_purchased_result", sqlstate: "42501", status: 403, code: "invalid_generation_reference", message: "A preview cannot use a purchased result as its source." },
  { token: "selected_preview_unavailable", sqlstate: "42501", status: 409, code: "selected_preview_unavailable", message: "The selected preview is no longer available." },
  { token: "invalid_selected_preview", sqlstate: "42501", status: 409, code: "invalid_selected_preview", message: "The selected preview is invalid or no longer current." },
  { token: "purchase_not_entitled", sqlstate: "42501", status: 403, code: "purchase_not_entitled", message: "This purchase no longer has generation access." },
  { token: "artwork_not_generation_ready", sqlstate: "42501", status: 409, code: "artwork_not_generation_ready", message: "This artwork is not available for generation." },
];

const tokenPatterns = new Map(
  knownErrors.map(({ token }) => [token, new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`)]),
);

export function postgresHttpError(
  error: PostgresErrorLike,
  fallback: { status: number; code: string; message: string },
) {
  const sqlstate = typeof error.code === "string" ? error.code.trim() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const known = knownErrors.find((entry) =>
    (sqlstate === "" || sqlstate === entry.sqlstate)
    && tokenPatterns.get(entry.token)!.test(message)
  );
  console.error("Postgres operation failed", {
    code: sqlstate || "unknown",
    classification: known?.code ?? fallback.code,
  });
  return new HttpError(
    known?.status ?? fallback.status,
    known?.code ?? fallback.code,
    known?.message ?? fallback.message,
  );
}

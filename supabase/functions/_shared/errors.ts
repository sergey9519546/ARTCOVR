import { corsHeaders } from "./cors.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function privateJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

export function respondError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
  console.error(error);
  return json({ error: "internal_error", message: "Unexpected server error." }, 500);
}

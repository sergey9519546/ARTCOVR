function appOrigin() {
  const configured = Deno.env.get("APP_ORIGIN") ?? "http://localhost:3000";
  const parsed = new URL(configured);
  if (!new Set(["http:", "https:"]).has(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash) {
    throw new Error("APP_ORIGIN must contain only an http(s) origin.");
  }
  return parsed.origin;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": appOrigin(),
  // Supabase browser clients send both `apikey` and `x-client-info`. Keep this
  // list explicit so a preflight cannot authorize arbitrary credential headers.
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, idempotency-key, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

export function preflight(request: Request): Response | null {
  return request.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}

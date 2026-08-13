import { createClient } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "./errors.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}
const url = requireEnv("SUPABASE_URL");
const anon = requireEnv("SUPABASE_ANON_KEY");
const service = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const timedFetch: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("supabase_request_timeout"), 15_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: timedFetch },
};

export const admin = createClient(url, service, clientOptions);

export async function requireUser(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthorized", "A magic-link session is required.");
  const client = createClient(url, anon, clientOptions);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Session is invalid or expired.");
  return data.user;
}

export async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; }
  catch { throw new HttpError(400, "invalid_json", "Request body must be JSON."); }
}

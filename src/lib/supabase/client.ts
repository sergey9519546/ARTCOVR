"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;
  const config = getSupabasePublicConfig();
  browserClient = config
    ? createBrowserClient(config.url, config.anonKey)
    : null;
  return browserClient;
}

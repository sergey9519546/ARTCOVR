"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/artcovr/navigation";

/**
 * Client-side magic-link / OAuth callback handler.
 *
 * Supabase sends the user here with a `code` query param after email OTP.
 * We exchange it for a session using the browser-side Supabase client, then
 * redirect to the intended destination. No server runtime required — fully
 * compatible with static export (Cloudflare Pages).
 */
export default function AuthCallbackPage() {
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const nextValue = params.get("next");
    const origin = window.location.origin;

    const destination = safeNext(nextValue, origin);
    const retryUrl = new URL("/sign-in", origin);
    retryUrl.searchParams.set("error", "callback");
    retryUrl.searchParams.set("next", destination);
    const retryDestination = retryUrl.toString();

    if (!code) {
      window.location.replace(retryDestination);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      window.location.replace(retryDestination);
      return;
    }
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          window.location.replace(retryDestination);
        } else {
          window.location.replace(`${origin}${destination}`);
        }
      })
      .catch(() => {
        window.location.replace(retryDestination);
      });
  }, []);

  return (
    <div
      aria-live="polite"
      className="text-sm font-medium tracking-[0.05em]"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        fontFamily: "var(--font-artcovr, sans-serif)",
        color: "currentColor",
      }}
    >
      Signing you in…
    </div>
  );
}

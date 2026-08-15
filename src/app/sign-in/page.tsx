"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Account services are not configured yet.");
      return;
    }

    setState("sending");
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/my-images`;
    const { error: signInError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });

    if (signInError) {
      setError(signInError.message);
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <PublicPage eyebrow="Account" title="SIGN IN">
      <p className="max-w-[52ch] text-sm leading-6 opacity-70">
        Use a magic link to generate images and access purchases. No password is required.
      </p>
      {state === "sent" ? (
        <p role="status" className="mt-8 border-l-2 border-current pl-4 text-lg font-bold">
          Check your inbox for a sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 max-w-md">
          <label htmlFor="email" className="text-xs font-bold uppercase tracking-[.08em]">
            Email address
          </label>
          <input
            id="email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-3 block w-full border border-current/30 bg-transparent px-4 py-4 outline-none focus:border-current"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="artcovr-button mt-4 px-5 py-4 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-wait disabled:opacity-50"
          >
            {state === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {error && <p role="alert" className="mt-4 text-sm text-[#a11212] dark:text-[#ff6b6b]">{error}</p>}
        </form>
      )}
    </PublicPage>
  );
}

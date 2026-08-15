"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { ArtcovrApiError, submitInquiry } from "@/lib/artcovr/functions";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    setNeedsSignIn(false);
    const form = new FormData(event.currentTarget);

    try {
      await submitInquiry(String(form.get("name") || ""), String(form.get("message") || ""));
      setSent(true);
    } catch (reason) {
      setNeedsSignIn(reason instanceof ArtcovrApiError && reason.code === "unauthorized");
      setError(reason instanceof Error ? reason.message : "Your inquiry could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <PublicPage eyebrow="Support" title={<>CUSTOM<br />INQUIRY.</>}>
      <p className="max-w-[50ch] text-sm leading-6 opacity-70">
        For a release with different needs, tell us what you are making and the artwork you are considering. Sign in with your email before sending so we can reply to the verified address on your account.
      </p>
      {sent ? (
        <p role="status" className="mt-8 border-l-2 border-current pl-4 font-bold">
          Your inquiry has been received. We’ll reply by email.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 grid gap-5">
          <label className="text-xs font-bold uppercase tracking-[.08em]">
            Name
            <input name="name" required className="mt-2 block w-full border border-current/30 bg-transparent px-4 py-3 text-base normal-case tracking-normal outline-none focus:border-current" />
          </label>
          <label className="text-xs font-bold uppercase tracking-[.08em]">
            Tell us about the release
            <textarea name="message" required rows={6} className="mt-2 block w-full resize-y border border-current/30 bg-transparent px-4 py-3 text-base normal-case tracking-normal outline-none focus:border-current" />
          </label>
          <button disabled={sending} className="artcovr-button w-fit px-5 py-4 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-wait disabled:opacity-50">
            {sending ? "Sending…" : "Send inquiry"}
          </button>
          {error && (
            <div role="alert" className="border-l-2 border-[#a11212] pl-4 text-sm dark:border-[#ff6b6b]">
              <p>{error}</p>
              {needsSignIn && <Link href="/sign-in" className="link-hover mt-2 inline-block font-bold">Sign in with email</Link>}
            </div>
          )}
        </form>
      )}
    </PublicPage>
  );
}

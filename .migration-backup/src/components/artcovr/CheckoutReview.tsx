"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { getCheckoutTotal, isCheckoutReady } from "@/lib/artcovr/artworks";
import {
  shouldDiscardSelectedPreview,
  shouldRotateCheckoutIdempotencyKey as shouldRotateCheckoutKey,
} from "@/lib/artcovr/checkout-errors";
import { ArtcovrApiError, createCheckout, getGenerationStatus } from "@/lib/artcovr/functions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthState = "checking" | "signed-in" | "signed-out" | "unavailable";

function removeSavedPreview(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage can be disabled after the page mounts. The in-memory selection
    // is still cleared, and the server remains authoritative at checkout.
  }
}

export function CheckoutReview({ artwork }: { artwork: Artwork }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<string>();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const checkoutReady = isCheckoutReady(artwork);
  const signInHref = `/sign-in?next=${encodeURIComponent(`/checkout/${artwork.slug}`)}`;
  const selectedPreviewKey = `artcovr:selected-preview:${artwork.id}`;
  const licenseMode = artwork.saleMode === "exclusive"
    ? "Exclusive commercial license"
    : artwork.saleMode === "repeatable"
      ? "Non-exclusive commercial license"
      : "License mode pending";

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    if (!client) {
      setAuthState("unavailable");
      return;
    }

    void client.auth.getSession()
      .then(({ data }) => {
        if (active) setAuthState(data.session ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (active) setAuthState("signed-out");
      });

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthState(session ? "signed-in" : "signed-out");
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let selectedPreviewId: string | null = null;
    try {
      selectedPreviewId = sessionStorage.getItem(selectedPreviewKey);
    } catch {
      // Locked-down iframes and some privacy modes throw on storage access.
      // Checkout degrades to "no selected preview" rather than unmounting the
      // route — there is no ErrorBoundary above this component.
      return;
    }
    if (!selectedPreviewId) return;
    void getGenerationStatus(selectedPreviewId)
      .then((status) => {
        if (!active) return;
        if (status.status === "succeeded" && status.previewUrl) {
          setSelectedImage(status.previewUrl);
        } else {
          removeSavedPreview(selectedPreviewKey);
          setSelectedImage(undefined);
        }
      })
      .catch((reason) => {
        if (active && shouldDiscardSelectedPreview(reason)) {
          removeSavedPreview(selectedPreviewKey);
          setSelectedImage(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedPreviewKey]);

  async function continueToCheckout() {
    if (!checkoutReady || authState !== "signed-in") return;
    const keyName = `artcovr:checkout-key:${artwork.id}`;
    try {
      setLoading(true);
      setError("");
      let idempotencyKey = sessionStorage.getItem(keyName);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(keyName, idempotencyKey);
      }
      const selectedPreviewId = sessionStorage.getItem(selectedPreviewKey) || undefined;
      const { checkoutUrl } = await createCheckout(
        artwork.id,
        idempotencyKey,
        selectedPreviewId,
      );
      window.location.assign(checkoutUrl);
    } catch (reason) {
      if (shouldRotateCheckoutKey(reason)) {
        sessionStorage.removeItem(keyName);
      }
      if (reason instanceof ArtcovrApiError && reason.code === "unauthorized") {
        setAuthState("signed-out");
      }
      if (shouldDiscardSelectedPreview(reason)) {
        removeSavedPreview(selectedPreviewKey);
        setSelectedImage(undefined);
      }
      setError(reason instanceof ArtcovrApiError && reason.code === "unauthorized"
        ? "Sign in to complete checkout."
        : reason instanceof Error ? reason.message : "Checkout is unavailable.");
      setLoading(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-24 pt-32 lg:px-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">Checkout review</p>
      <div className="mt-4 grid gap-10 border-t-2 border-current pt-5 md:grid-cols-[1fr_.8fr]">
        <figure className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
          <Image src={selectedImage || artwork.image} alt={selectedImage ? `Selected generated image for ${artwork.title}` : artwork.alt} fill preload loading="eager" unoptimized={Boolean(selectedImage)} sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />
          <figcaption className="absolute bottom-0 left-0 bg-[#f3eee6] px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-black">
            {selectedImage ? "Selected generated image" : "Original artwork"}
          </figcaption>
        </figure>
        <section>
          <h1 className="break-words text-4xl font-extrabold tracking-tighter md:text-6xl">{artwork.title}</h1>
          <p className="mt-4 text-sm font-bold uppercase tracking-[0.08em]">{checkoutReady ? licenseMode : "Rights and pricing review pending"}</p>
          <dl className="mt-8 divide-y divide-current/20 border-y border-current/20 text-sm">
            <div className="flex justify-between gap-6 py-4"><dt>Availability</dt><dd className="text-right">{checkoutReady ? "Available" : "Pending owner approval"}</dd></div>
            <div className="flex justify-between gap-6 py-4"><dt>License</dt><dd className="text-right">{licenseMode}</dd></div>
            <div className="flex justify-between py-4 font-bold"><dt>Total</dt><dd>{getCheckoutTotal(artwork.priceCents)}</dd></div>
          </dl>
          <p className="mt-8 max-w-[45ch] text-sm leading-6 opacity-70">
            {checkoutReady
              ? "Your purchase includes the original artwork, your selected preview when present, and successful purchased generations during the access period."
              : "Checkout activates after the owner approves commercial rights, price, license mode, and publication."}
          </p>
          {checkoutReady && authState === "signed-out" && (
            <aside className="mt-7 border-l-2 border-current pl-4 text-sm leading-6">
              <p>Sign in before opening the secure checkout. You will return to this review.</p>
              <Link href={signInHref} className="link-hover mt-2 inline-block font-bold">
                Sign in with email
              </Link>
            </aside>
          )}
          {checkoutReady && authState === "checking" && (
            <p role="status" className="mt-7 text-sm opacity-70">Checking your sign-in…</p>
          )}
          {checkoutReady && authState === "unavailable" && (
            <p role="alert" className="mt-7 border-l-2 border-[var(--alert)] pl-4 text-sm">
              Account services are not configured, so checkout cannot open yet.
            </p>
          )}
          <label className="mt-7 flex gap-3 text-sm leading-5">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={!checkoutReady} className="mt-1 size-4 accent-[var(--foreground)]" />
            <span>I agree to the <Link href="/license" className="underline underline-offset-4">commercial license</Link> and <Link href="/legal/terms" className="underline underline-offset-4">terms</Link>.</span>
          </label>
          <button type="button" disabled={!checkoutReady || authState !== "signed-in" || !accepted || loading} onClick={continueToCheckout} className="artcovr-button mt-7 w-full px-5 py-4 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
            {!checkoutReady
              ? "Checkout pending owner approval"
              : authState === "checking"
                ? "Checking sign-in…"
                : authState === "signed-out"
                  ? "Sign in to continue"
                  : authState === "unavailable"
                    ? "Checkout unavailable"
                    : loading ? "Opening checkout…" : "Continue to checkout"}
          </button>
          {error && <p role="alert" className="mt-3 text-sm text-[var(--alert)]">{error}</p>}
        </section>
      </div>
    </main>
  );
}

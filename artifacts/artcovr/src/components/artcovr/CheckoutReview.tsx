"use client";

import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { useArtcovrAuth } from "@/lib/artcovr/auth";
import { useEffect, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import {
  getArtworkLicenseLabel,
  getArtworkPriceLabel,
  includedCreditsPerCover,
  isCheckoutReady,
} from "@/lib/artcovr/artworks";
import { trackEvent } from "@/lib/artcovr/analytics";
import {
  shouldRotateCheckoutIdempotencyKey as shouldRotateCheckoutKey,
} from "@/lib/artcovr/checkout-errors";
import { createCheckout, getGenerationStatus } from "@/lib/artcovr/functions";

export function CheckoutReview({ artwork }: { artwork: Artwork }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [selectedImage, setSelectedImage] = useState<string>();
  const { isLoaded, isSignedIn } = useArtcovrAuth();
  const checkoutReady = isCheckoutReady(artwork);
  const checkoutRedirect = typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authRedirect = `?redirect_url=${encodeURIComponent(checkoutRedirect)}`;
  const guestEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const licenseMode = getArtworkLicenseLabel(artwork);

  useEffect(() => {
    let active = true;
    let selectedPreviewId: string | null = null;
    try {
      selectedPreviewId = sessionStorage.getItem(
        `artcovr:selected-preview:${artwork.id}`,
      );
    } catch {
      // Locked-down iframes and some privacy modes throw on storage access.
      // Checkout degrades to "no selected preview" rather than unmounting the
      // route — there is no ErrorBoundary above this component.
      return;
    }
    if (!selectedPreviewId) return;
    void getGenerationStatus(selectedPreviewId)
      .then((status) => {
        if (active && status.status === "succeeded" && status.previewUrl) {
          setSelectedImage(status.previewUrl);
        }
      })
      .catch(() => {
        // The server validates ownership and expiry again at checkout.
      });
    return () => {
      active = false;
    };
  }, [artwork.id]);

  async function continueToCheckout() {
    if (!checkoutReady || !isLoaded) return;
    if (!isSignedIn && !guestEmailIsValid) return;
    const keyName = `artcovr:checkout-key:${artwork.id}`;
    try {
      setLoading(true);
      setError("");
      const previewKey = `artcovr:selected-preview:${artwork.id}`;
      let idempotencyKey: string | null = null;
      let selectedPreviewId: string | undefined;
      try {
        idempotencyKey = sessionStorage.getItem(keyName);
        if (!idempotencyKey) {
          idempotencyKey = crypto.randomUUID();
          sessionStorage.setItem(keyName, idempotencyKey);
        }
        selectedPreviewId = sessionStorage.getItem(previewKey) || undefined;
      } catch {
        setError(
          "Checkout needs browser storage to protect your payment attempt. Enable site storage and try again.",
        );
        setLoading(false);
        return;
      }
      const { checkoutUrl } = await createCheckout(
        artwork.id,
        idempotencyKey,
        selectedPreviewId,
        isSignedIn ? undefined : guestEmail.trim().toLowerCase(),
      );
      trackEvent("checkout_started", {
        artwork_slug: artwork.slug,
        sale_mode: artwork.saleMode ?? "unknown",
        signed_in: isSignedIn,
        price_cents: artwork.priceCents ?? 0,
        has_selected_preview: Boolean(selectedPreviewId),
      });
      window.location.assign(checkoutUrl);
    } catch (reason) {
      if (shouldRotateCheckoutKey(reason)) {
        try {
          sessionStorage.removeItem(keyName);
        } catch {
          // The error below remains actionable even when browser storage is locked.
        }
      }
      setError(reason instanceof Error ? reason.message : "Checkout is unavailable.");
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
            <div className="flex justify-between gap-6 py-4"><dt>Studio credits</dt><dd className="text-right">{includedCreditsPerCover} included</dd></div>
            <div className="flex justify-between py-4 font-bold"><dt>Total</dt><dd>{getArtworkPriceLabel(artwork)}</dd></div>
          </dl>
          <p className="mt-8 max-w-[45ch] text-sm leading-6 opacity-70">
            {checkoutReady
              ? "Your purchase includes the original artwork, your selected preview when present, and successful purchased generations during the access period."
              : "Checkout activates after the owner approves commercial rights, price, license mode, and publication."}
          </p>
          {checkoutReady ? (
            <aside className="mt-6 border-l-2 border-current/30 pl-4 text-xs leading-5 opacity-70">
              <p>
                Next, you’ll continue to Stripe’s secure checkout. Signed-in purchases are linked to your account; guest purchases use the email above for the Stripe receipt and purchase record.
              </p>
              <p className="mt-2">
                Need help with an interrupted checkout?{" "}
                <Link href="/contact" className="link-hover font-bold">Contact support</Link>
                {" "}or review the <Link href="/refunds" className="link-hover font-bold">refund policy</Link>.
              </p>
            </aside>
          ) : null}
          <label className="mt-7 flex gap-3 text-sm leading-5">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={!checkoutReady} className="mt-1 size-4 accent-[var(--foreground)]" />
            <span>I agree to the <Link href="/license" className="underline underline-offset-4">commercial license</Link> and <Link href="/legal/terms" className="underline underline-offset-4">terms</Link>.</span>
          </label>
          {!isLoaded ? (
            <p className="mt-7 border-y border-current/20 py-5 text-sm opacity-70" role="status">
              Checking account and checkout readiness…
            </p>
          ) : isLoaded && !isSignedIn ? (
            <section
              aria-label="Guest checkout"
              className="mt-7 border-y-2 border-current py-5"
            >
              <p className="font-bold">Checkout as a guest</p>
              <p className="mt-2 max-w-[45ch] text-sm leading-6 opacity-70">
                Enter your email for your Stripe receipt and purchase records. No account required.
              </p>
              <form
                className="mt-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void continueToCheckout();
                }}
              >
                <label htmlFor="guest-checkout-email" className="text-xs font-bold uppercase tracking-[0.08em]">
                  Email for receipt
                </label>
                <input
                  id="guest-checkout-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-none border border-current/30 bg-transparent px-4 py-4 text-base outline-none focus:border-current"
                />
                <button
                  type="submit"
                  disabled={!checkoutReady || !accepted || loading || !guestEmailIsValid}
                  className="artcovr-button mt-4 w-full px-5 py-4 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Opening checkout…" : "Checkout as guest"}
                </button>
              </form>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link
                  href={`/sign-in${authRedirect}`}
                  className="link-hover text-xs font-bold uppercase tracking-[0.08em]"
                >
                  Already have an account? Sign in
                </Link>
                <Link
                  href={`/sign-up${authRedirect}`}
                  className="link-hover text-xs font-bold uppercase tracking-[0.08em]"
                >
                  Create an account
                </Link>
              </div>
            </section>
          ) : (
            <button type="button" disabled={!checkoutReady || !accepted || loading} onClick={continueToCheckout} className="artcovr-button mt-7 w-full px-5 py-4 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
              {checkoutReady ? (loading ? "Opening checkout…" : "Continue to checkout") : "Checkout pending owner approval"}
            </button>
          )}
          {error && (
            <div className="mt-4 border-l-2 border-[#a11212] pl-4 text-sm text-[#a11212] dark:border-[#ff6b6b] dark:text-[#ff6b6b]">
              <p role="alert">{error}</p>
              <button
                type="button"
                onClick={() => void continueToCheckout()}
                disabled={!checkoutReady || !accepted || loading || (!isSignedIn && !guestEmailIsValid)}
                className="mt-3 font-bold underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Try checkout again
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { getCheckoutTotal, isCheckoutReady } from "@/lib/artcovr/artworks";
import {
  shouldRotateCheckoutIdempotencyKey as shouldRotateCheckoutKey,
} from "@/lib/artcovr/checkout-errors";
import { createCheckout, getGenerationStatus } from "@/lib/artcovr/functions";

export function CheckoutReview({ artwork }: { artwork: Artwork }) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<string>();
  const checkoutReady = isCheckoutReady(artwork);
  const licenseMode = artwork.saleMode === "exclusive"
    ? "Exclusive commercial license"
    : artwork.saleMode === "repeatable"
      ? "Non-exclusive commercial license"
      : "License mode pending";

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
    if (!checkoutReady) return;
    const keyName = `artcovr:checkout-key:${artwork.id}`;
    try {
      setLoading(true);
      setError("");
      const previewKey = `artcovr:selected-preview:${artwork.id}`;
      let idempotencyKey = sessionStorage.getItem(keyName);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(keyName, idempotencyKey);
      }
      const selectedPreviewId = sessionStorage.getItem(previewKey) || undefined;
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
            <div className="flex justify-between py-4 font-bold"><dt>Total</dt><dd>{getCheckoutTotal(artwork.priceCents)}</dd></div>
          </dl>
          <p className="mt-8 max-w-[45ch] text-sm leading-6 opacity-70">
            {checkoutReady
              ? "Your purchase includes the original artwork, your selected preview when present, and successful purchased generations during the access period."
              : "Checkout activates after the owner approves commercial rights, price, license mode, and publication."}
          </p>
          <label className="mt-7 flex gap-3 text-sm leading-5">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={!checkoutReady} className="mt-1 size-4 accent-[var(--foreground)]" />
            <span>I agree to the <Link href="/license" className="underline underline-offset-4">commercial license</Link> and <Link href="/legal/terms" className="underline underline-offset-4">terms</Link>.</span>
          </label>
          <button type="button" disabled={!checkoutReady || !accepted || loading} onClick={continueToCheckout} className="artcovr-button mt-7 w-full px-5 py-4 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
            {checkoutReady ? (loading ? "Opening checkout…" : "Continue to checkout") : "Checkout pending owner approval"}
          </button>
          {error && <p role="alert" className="mt-3 text-sm text-[#a11212] dark:text-[#ff6b6b]">{error}</p>}
        </section>
      </div>
    </main>
  );
}

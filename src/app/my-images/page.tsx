"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PurchasedGenerationStudio } from "@/components/artcovr/PurchasedGenerationStudio";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { getArtworkBySlug } from "@/lib/artcovr/artworks";
import { ArtcovrApiError, getMyImages, type AccountData } from "@/lib/artcovr/functions";
import { signedUrlRefreshDelay } from "@/lib/artcovr/signed-url-refresh";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
    : "—";
}

function signedUrlExpirations(data: AccountData) {
  return [
    ...data.downloads.map((download) => download.urlExpiresAt),
    ...data.generations.flatMap((generation) => [
      generation.previewUrl ? generation.previewUrlExpiresAt : undefined,
      generation.cleanUrl ? generation.cleanUrlExpiresAt : undefined,
    ]),
  ];
}

export default function MyImagesPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "ready" | "error">("loading");
  const [data, setData] = useState<AccountData>({ purchases: [], generations: [], downloads: [], unavailableDownloads: [] });
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [checkoutPollingStopped, setCheckoutPollingStopped] = useState(false);
  const mounted = useRef(false);
  const checkoutPolls = useRef(0);
  const accountRequestSequence = useRef(0);
  const signingOut = useRef(false);
  const signedUrlRefreshInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAccount = useCallback(async (quiet = false) => {
    if (signingOut.current) return null;
    const requestSequence = ++accountRequestSequence.current;
    const isCurrentRequest = () =>
      mounted.current && requestSequence === accountRequestSequence.current;
    const client = getSupabaseBrowserClient();
    if (!client) {
      if (isCurrentRequest()) {
        setState("error");
        setMessage("Account services are not configured yet.");
      }
      return null;
    }
    if (!quiet && isCurrentRequest()) setState("loading");

    let sessionData;
    try {
      ({ data: sessionData } = await client.auth.getSession());
    } catch {
      if (isCurrentRequest()) {
        setState("error");
        setMessage("Your account session could not be checked. Try again.");
      }
      return null;
    }
    if (!sessionData.session) {
      if (isCurrentRequest()) setState("signed-out");
      return null;
    }

    try {
      const account = await getMyImages();
      if (isCurrentRequest()) {
        setData(account);
        setMessage("");
        setState("ready");
      }
      return account;
    } catch (error) {
      if (isCurrentRequest()) {
        if (error instanceof ArtcovrApiError && error.code === "unauthorized") {
          setState("signed-out");
        } else {
          setState("error");
          setMessage(error instanceof Error ? error.message : "My Images is unavailable.");
        }
      }
      return null;
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    if (mounted.current) {
      setRefreshing(true);
      setCheckoutPollingStopped(false);
    }
    checkoutPolls.current = 0;
    try {
      await loadAccount(true);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [loadAccount]);

  const refreshSignedUrls = useCallback(async () => {
    if (signingOut.current || signedUrlRefreshInFlight.current) return;
    signedUrlRefreshInFlight.current = true;
    try {
      await loadAccount(true);
    } finally {
      signedUrlRefreshInFlight.current = false;
    }
  }, [loadAccount]);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    accountRequestSequence.current += 1;
    const client = getSupabaseBrowserClient();
    if (!client) {
      signingOut.current = false;
      if (mounted.current) {
        setState("error");
        setMessage("Account services are not configured yet.");
      }
      return;
    }
    setRefreshing(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch {
      signingOut.current = false;
      if (mounted.current) {
        setRefreshing(false);
        setMessage("Sign out failed. Please try again.");
      }
      return;
    }
    // Invalidate any account request that a checkout timer began while the
    // asynchronous sign-out call was in flight. No response from the previous
    // session may repopulate this page after sign-out succeeds.
    accountRequestSequence.current += 1;
    if (!mounted.current) return;
    setRefreshing(false);
    setData({ purchases: [], generations: [], downloads: [], unavailableDownloads: [] });
    setMessage("");
    setState("signed-out");
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setReturnedFromCheckout(searchParams.get("checkout") === "return");
  }, []);

  useEffect(() => {
    if (signingOut.current || refreshing || state !== "ready" || !returnedFromCheckout) return;
    const waitingForWebhook = data.purchases.some(
      (purchase) => purchase.status === "pending" || purchase.status === "reserved",
    );
    if (!waitingForWebhook || checkoutPolls.current >= 15) return;

    const timer = window.setTimeout(() => {
      if (signingOut.current) return;
      checkoutPolls.current += 1;
      void loadAccount(true).finally(() => {
        if (mounted.current && checkoutPolls.current >= 15) {
          setCheckoutPollingStopped(true);
        }
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [data.purchases, loadAccount, refreshing, returnedFromCheckout, state]);

  useEffect(() => {
    if (signingOut.current || refreshing || state !== "ready") return;
    const delay = signedUrlRefreshDelay(signedUrlExpirations(data));
    if (delay === null) return;

    const timer = window.setTimeout(() => {
      void refreshSignedUrls();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [data, refreshSignedUrls, refreshing, state]);

  useEffect(() => {
    if (signingOut.current || refreshing || state !== "ready") return;

    const refreshIfNearExpiry = () => {
      if (document.visibilityState !== "visible") return;
      if (signedUrlRefreshDelay(signedUrlExpirations(data)) === 0) {
        void refreshSignedUrls();
      }
    };
    window.addEventListener("focus", refreshIfNearExpiry);
    document.addEventListener("visibilitychange", refreshIfNearExpiry);
    return () => {
      window.removeEventListener("focus", refreshIfNearExpiry);
      document.removeEventListener("visibilitychange", refreshIfNearExpiry);
    };
  }, [data, refreshSignedUrls, refreshing, state]);

  const hasPendingCheckout = state === "ready" && data.purchases.some(
    (purchase) => purchase.status === "pending" || purchase.status === "reserved",
  );

  return (
    <PublicPage eyebrow="Account" title="MY IMAGES">
      {state === "loading" && <p role="status">Loading your images…</p>}
      {state === "ready" && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          {message ? <p role="alert" className="text-sm text-[var(--alert)]">{message}</p> : <span />}
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={refreshing}
            className="link-hover text-xs font-bold uppercase tracking-[.08em] disabled:cursor-wait disabled:opacity-50"
          >
            {refreshing ? "Working…" : "Sign out"}
          </button>
        </div>
      )}
      {state === "signed-out" && (
        <section className="border-y border-current/20 py-10">
          <p className="text-xl font-bold tracking-tight">Sign in to view your images.</p>
          <p className="mt-3 max-w-[50ch] text-sm leading-6 opacity-70">
            Purchases, prompts, generated images, allowances, expirations, and downloads stay connected here.
          </p>
          <Link href="/sign-in?next=%2Fmy-images" className="artcovr-button mt-7 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">
            Sign in with email
          </Link>
        </section>
      )}
      {state === "error" && (
        <section className="border-l-2 border-[var(--alert)] pl-4">
          <p role="alert">{message}</p>
          <button type="button" onClick={() => void refreshAccount()} disabled={refreshing} className="link-hover mt-3 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-wait disabled:opacity-50">
            {refreshing ? "Checking…" : "Try again"}
          </button>
        </section>
      )}
      {hasPendingCheckout && (
        <section aria-labelledby="pending-checkout-title" className="mb-10 border-l-2 border-current pl-4">
          <h2 id="pending-checkout-title" className="text-lg font-bold">Checkout confirmation pending</h2>
          <p role="status" aria-live="polite" className="mt-2 max-w-[58ch] text-sm leading-6 opacity-70">
            {returnedFromCheckout && !checkoutPollingStopped
              ? "We are checking automatically. Downloads remain locked until verified payment reaches ARTCOVR."
              : "The verified payment state has not changed yet. Downloads remain locked until confirmation reaches ARTCOVR."}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-[.08em]">
            <button type="button" onClick={() => void refreshAccount()} disabled={refreshing} className="link-hover disabled:cursor-wait disabled:opacity-50">
              {refreshing ? "Checking…" : "Check again"}
            </button>
            <Link href="/contact" className="link-hover">Contact support</Link>
          </div>
        </section>
      )}
      {state === "ready" && data.purchases.length === 0 && data.generations.length === 0 && (
        <section className="border-y border-current/20 py-10">
          <p className="text-xl font-bold">
            {returnedFromCheckout
              ? "No purchase is visible yet."
              : "No purchases or generated images yet."}
          </p>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 opacity-70">
            {returnedFromCheckout
              ? "Confirmation can take a moment after returning from checkout. Check again, or browse the archive while you wait."
              : "Browse the approved archive to choose artwork, or refresh if you expected a recent purchase."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/archive" className="artcovr-button inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">
              Browse archive
            </Link>
            <button type="button" onClick={() => void refreshAccount()} disabled={refreshing} className="border border-current px-5 py-4 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-wait disabled:opacity-50">
              {refreshing ? "Checking…" : "Refresh account"}
            </button>
          </div>
        </section>
      )}
      {state === "ready" && data.purchases.map((purchase) => {
        const purchaseGenerations = data.generations.filter((generation) => generation.purchaseId === purchase.id);
        const downloads = data.downloads.filter((download) => download.purchaseId === purchase.id);
        const unavailableDownloads = (data.unavailableDownloads ?? []).filter(
          (download) => download.purchaseId === purchase.id,
        );
        const artwork = getArtworkBySlug(purchase.artworkSlug);
        const baseImageUrl = downloads.find((download) => download.kind === "base")?.url;
        const selectedPreviewImageUrl = downloads.find(
          (download) => download.kind === "selected_preview",
        )?.url;
        const editorArtwork = artwork || (baseImageUrl
          ? {
              id: purchase.artworkId,
              slug: purchase.artworkSlug,
              title: purchase.artworkTitle,
              image: baseImageUrl,
              alt: `${purchase.artworkTitle} original artwork`,
              description: "Purchased ARTCOVR artwork.",
              category: "Cover art",
              moodTags: [],
              editionAvailable: null,
              editionTotal: null,
              licenseLabel: null,
              saleMode: purchase.saleMode,
              priceCents: purchase.amountCents,
              rightsApproved: true,
              published: false,
              accentColor: "#122519",
            }
          : null);
        const entitlementActive = purchase.entitlementExpiresAt
          ? new Date(purchase.entitlementExpiresAt) > new Date()
          : false;

        return (
          <article key={purchase.id} className="mb-16 border-t-2 border-current pt-5">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">{purchase.status}</p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{purchase.artworkTitle}</h2>
              </div>
              {artwork && <Link href={`/product/${purchase.artworkSlug}`} className="link-hover text-xs font-bold uppercase tracking-[.08em]">View artwork</Link>}
            </div>
            <dl className="mt-6 grid gap-4 border-y border-current/20 py-5 text-sm sm:grid-cols-3">
              <div><dt className="opacity-60">Generations remaining</dt><dd className="mt-1 font-bold">{purchase.remainingGenerations}</dd></div>
              <div><dt className="opacity-60">Access expires</dt><dd className="mt-1 font-bold">{formatDate(purchase.entitlementExpiresAt)}</dd></div>
              <div><dt className="opacity-60">Paid</dt><dd className="mt-1 font-bold">{purchase.paidAt ? `${(purchase.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: purchase.currency })} · ${formatDate(purchase.paidAt)}` : "—"}</dd></div>
            </dl>
            {purchase.status === "paid" && purchase.remainingGenerations === 0 && (
              <p className="mt-5 max-w-[58ch] text-sm leading-6">
                Your generation allowance is complete. Existing clean downloads remain available while access is active.{" "}
                <Link href="/archive" className="underline underline-offset-4">Browse another licensed work</Link>.
              </p>
            )}
            {downloads.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {downloads.map((download) => (
                  <a key={`${download.kind}-${download.generationId || "base"}`} href={download.url} download className="border border-current px-4 py-3 text-xs font-bold uppercase tracking-[.08em]">
                    Download {download.kind.replaceAll("_", " ")}
                  </a>
                ))}
              </div>
            )}
            {unavailableDownloads.length > 0 && (
              <div role="alert" className="mt-6 border-l-2 border-[var(--alert)] pl-4">
                <p className="text-sm font-bold">Downloads temporarily unavailable</p>
                <p className="mt-2 max-w-[58ch] text-sm leading-6 opacity-70">
                  {unavailableDownloads.length === 1 ? "One licensed file could" : "Some licensed files could"} not be prepared. Your entitlement is unchanged. Retry now, or contact support if the problem continues.
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-[.08em]">
                  <button type="button" onClick={() => void refreshAccount()} disabled={refreshing} className="link-hover disabled:cursor-wait disabled:opacity-50">
                    {refreshing ? "Checking…" : "Retry downloads"}
                  </button>
                  <Link href="/contact" className="link-hover">Contact support</Link>
                </div>
              </div>
            )}
            {purchase.accessRevokedAt && (
              <p role="status" className="mt-6 border-l-2 border-current pl-4 text-sm">
                Access was revoked{purchase.accessRevocationReason ? `: ${purchase.accessRevocationReason.replaceAll("_", " ")}` : "."}
              </p>
            )}
            {purchase.status === "paid" && !purchase.accessRevokedAt && entitlementActive && editorArtwork && (
              <PurchasedGenerationStudio
                artwork={editorArtwork}
                purchase={purchase}
                generations={purchaseGenerations}
                baseImageUrl={baseImageUrl}
                selectedPreviewImageUrl={selectedPreviewImageUrl}
                onGenerationCompleted={refreshAccount}
              />
            )}
            {purchaseGenerations.map((generation) => (
              <div key={generation.id} className="mt-7 border-l border-current/30 pl-5">
                <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-60">{generation.status} · expires {formatDate(generation.expiresAt)}</p>
                <p className="mt-2 text-sm leading-6">{generation.prompt}</p>
                {generation.previewUrl && <a href={generation.previewUrl} className="link-hover mt-3 inline-block text-xs font-bold uppercase tracking-[.08em]">View result</a>}
              </div>
            ))}
          </article>
        );
      })}
      {state === "ready" && data.generations.filter((generation) => !generation.purchaseId).length > 0 && (
        <section className="border-t-2 border-current pt-5">
          <h2 className="text-3xl font-extrabold tracking-tight">Preview results</h2>
          {data.generations.filter((generation) => !generation.purchaseId).map((generation) => (
            <div key={generation.id} className="mt-7 border-l border-current/30 pl-5">
              <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-60">{generation.status} · expires {formatDate(generation.expiresAt)}</p>
              <p className="mt-2 text-sm leading-6">{generation.prompt}</p>
              {generation.previewUrl && <a href={generation.previewUrl} className="link-hover mt-3 inline-block text-xs font-bold uppercase tracking-[.08em]">View result</a>}
            </div>
          ))}
        </section>
      )}
    </PublicPage>
  );
}

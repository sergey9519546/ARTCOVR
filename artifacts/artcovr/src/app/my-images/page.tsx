"use client";

import Link from "@/components/compat/Link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PurchasedGenerationStudio } from "@/components/artcovr/PurchasedGenerationStudio";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { displayArtworks, getArtworkBySlug } from "@/lib/artcovr/artworks";
import {
  ArtcovrApiError,
  claimGuestPurchases,
  createCreditPackCheckout,
  getCreditPackCheckoutStatus,
  getCreditPackOptions,
  getMyImages,
  type CreditPackOptions,
  type AccountData,
  type AccountDownload,
  type AccountGeneration,
} from "@/lib/artcovr/functions";
import { trackEvent } from "@/lib/artcovr/analytics";
import { appendOlderCreditActivity } from "@/lib/artcovr/account-activity";
import { resolveCurrentDownload } from "@/lib/artcovr/account-download";
import { CoverArtPreflight } from "@/components/artcovr/CoverArtPreflight";

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
    : "—";
}

function generationStatusDescription(status: AccountGeneration["status"]) {
  switch (status) {
    case "queued":
      return "Your edit is queued.";
    case "running":
      return "Your edit is being generated.";
    case "succeeded":
      return "Your result is ready.";
    case "blocked":
      return "This edit could not be generated.";
    case "timed_out":
      return "This edit timed out before a result was ready.";
    case "failed":
      return "This edit failed before a result was ready.";
    default:
      return "This edit has an unknown status.";
  }
}

function AccountGenerationSummary({
  generation,
  artworkTitle,
  artworkSlug,
}: {
  generation: AccountGeneration;
  artworkTitle: string;
  artworkSlug?: string;
}) {
  return (
    <div className="mt-7 border-l border-current/30 pl-5">
      <p className="text-[11px] font-bold uppercase tracking-[.08em] opacity-60">
        {generation.phase === "purchased" ? "Purchased edit" : "Preview edit"} ·{" "}
        {generation.status} · {formatDate(generation.createdAt)}
      </p>
      <p className="mt-2 text-sm font-bold">{artworkTitle}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
        {generationStatusDescription(generation.status)} Expires{" "}
        {formatDate(generation.expiresAt)}.
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold uppercase tracking-[.08em]">
        {artworkSlug && (
          <Link href={`/product/${artworkSlug}`} className="link-hover">
            View artwork
          </Link>
        )}
        {generation.previewUrl && (
          <a href={generation.previewUrl} className="link-hover">
            View preview result
          </a>
        )}
        {generation.cleanUrl && (
          <a href={generation.cleanUrl} className="link-hover">
            View final result
          </a>
        )}
      </div>
    </div>
  );
}

export default function MyImagesPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "ready" | "error">("loading");
  const [data, setData] = useState<AccountData>({
    totalCreditBalance: 0,
    topUpCreditBalance: 0,
    creditPackPurchases: [],
    creditActivity: [],
    creditActivityNextCursor: null,
    purchases: [],
    generations: [],
    downloads: [],
  });
  const [message, setMessage] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [loadingOlderActivity, setLoadingOlderActivity] = useState(false);
  const [creditPackOptions, setCreditPackOptions] = useState<CreditPackOptions | null>(null);
  const [creditPackQuantity, setCreditPackQuantity] = useState(1);
  const [creditPackBusy, setCreditPackBusy] = useState(false);
  const [creditPackMessage, setCreditPackMessage] = useState("");
  const mounted = useRef(false);
  const checkoutPolls = useRef(0);
  const checkoutReturnTracked = useRef(false);
  const checkoutCompletedTracked = useRef(new Set<string>());
  const creditPackAttempt = useRef<{ credits: number; key: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAccount = useCallback(async (quiet = false, claimPurchases = false) => {
    if (!quiet && mounted.current) setState("loading");

    try {
      if (claimPurchases) {
        try {
          await claimGuestPurchases();
        } catch (error) {
          // An unverified account can still view its own account data. It just
          // cannot claim a guest checkout until Clerk verifies its email.
          if (
            !(
              error instanceof ArtcovrApiError &&
              error.code === "verified_email_required"
            )
          ) {
            throw error;
          }
        }
      }
      const account = await getMyImages();
      if (mounted.current) {
        setData(account);
        setMessage("");
        setDownloadMessage(
          account.unavailableDownloads?.length
            ? "Some licensed files could not be prepared. Retry downloads."
            : "",
        );
        setState("ready");
      }
      return account;
    } catch (error) {
      if (mounted.current) {
        if (error instanceof ArtcovrApiError && error.code === "unauthorized") {
          setState("signed-out");
        } else {
          if (!quiet) setState("error");
          setMessage(error instanceof Error ? error.message : "My Images is unavailable.");
        }
      }
      return null;
    }
  }, []);

  const loadOlderActivity = useCallback(async () => {
    const requestedCursor = data.creditActivityNextCursor;
    if (!requestedCursor || loadingOlderActivity) return;
    setLoadingOlderActivity(true);
    try {
      const account = await getMyImages(requestedCursor);
      if (mounted.current) {
        setData((current) =>
          appendOlderCreditActivity(current, account, requestedCursor),
        );
      }
    } catch (error) {
      if (mounted.current) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Older credit activity could not be loaded.",
        );
      }
    } finally {
      if (mounted.current) setLoadingOlderActivity(false);
    }
  }, [data.creditActivityNextCursor, loadingOlderActivity]);

  const refreshAccount = useCallback(async () => {
    // Keep the selected canvas and pending edit mounted while refreshing the
    // allowance. A temporary fetch error must not reset an artist's workspace.
    await loadAccount(true);
  }, [loadAccount]);

  const handleDownload = useCallback(
    async (
      requested: Pick<
        AccountDownload,
        "kind" | "purchaseId" | "artworkId" | "generationId"
      >,
    ) => {
      setDownloadMessage("");
      // Open the tab during the click gesture, then navigate it only after the
      // server has revalidated ownership and returned a fresh signed URL.
      const popup = window.open("about:blank", "_blank");
      try {
        if (!popup) {
          throw new Error("Allow pop-ups to download this file.");
        }
        const account = await loadAccount(true);
        if (!account) {
          throw new Error("Download access could not be verified. Try again.");
        }
        const download = resolveCurrentDownload(account, requested);
        popup.location.href = download.url;
      } catch (error) {
        popup?.close();
        setDownloadMessage(
          error instanceof Error
            ? error.message
            : "This file could not be prepared. Retry the download in a moment or contact support.",
        );
      }
    },
    [loadAccount],
  );

  useEffect(() => {
    void loadAccount(false, true);
  }, [loadAccount]);

  useEffect(() => {
    if (state !== "ready" || creditPackOptions) return;
    let active = true;
    void getCreditPackOptions()
      .then((options) => {
        if (!active) return;
        setCreditPackOptions(options);
        setCreditPackMessage("");
      })
      .catch((error) => {
        if (!active) return;
        setCreditPackMessage(
          error instanceof Error
            ? error.message
            : "Standalone credit packs are temporarily unavailable.",
        );
      });
    return () => {
      active = false;
    };
  }, [state, creditPackOptions]);

  const startCreditPackCheckout = useCallback(async () => {
    if (!creditPackOptions || creditPackBusy) return;
    let attempt = creditPackAttempt.current;
    if (!attempt || attempt.credits !== creditPackQuantity) {
      attempt = { credits: creditPackQuantity, key: crypto.randomUUID() };
      creditPackAttempt.current = attempt;
    }
    setCreditPackBusy(true);
    setCreditPackMessage("");
    try {
      const checkout = await createCreditPackCheckout(
        attempt.credits,
        attempt.key,
      );
      window.location.assign(checkout.checkoutUrl);
    } catch (error) {
      setCreditPackMessage(
        error instanceof Error
          ? error.message
          : "Credit checkout could not be started. Try again.",
      );
    } finally {
      if (mounted.current) setCreditPackBusy(false);
    }
  }, [creditPackBusy, creditPackOptions, creditPackQuantity]);

  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const checkoutState = searchParams.get("credit_checkout");
    if (checkoutState === "cancelled") {
      setCreditPackMessage("Checkout was cancelled. No credits were added.");
      return;
    }
    if (checkoutState !== "return") return;
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      setCreditPackMessage("We could not verify that credit checkout.");
      return;
    }

    let active = true;
    let timer: number | undefined;
    let attempts = 0;
    setCreditPackMessage("Confirming your credit pack payment…");
    const checkStatus = async () => {
      try {
        const status = await getCreditPackCheckoutStatus(sessionId);
        if (!active) return;
        if (status.status === "paid") {
          await loadAccount(true);
          if (active) {
            setCreditPackMessage(
              `${status.credits} image-edit credit${status.credits === 1 ? "" : "s"} added to your account.`,
            );
          }
          return;
        }
        if (status.status === "expired" || status.status === "refunded") {
          setCreditPackMessage(
            status.status === "refunded"
              ? "This credit pack was refunded."
              : "This credit checkout expired before payment completed.",
          );
          return;
        }
      } catch (error) {
        if (!active) return;
        if (attempts >= 14) {
          setCreditPackMessage(
            error instanceof Error
              ? error.message
              : "Payment confirmation is delayed. Refresh your account shortly.",
          );
          return;
        }
      }
      attempts += 1;
      if (attempts >= 15) {
        setCreditPackMessage(
          "Payment is still being confirmed. Refresh your account shortly.",
        );
        return;
      }
      timer = window.setTimeout(() => void checkStatus(), 2000);
    };
    void checkStatus();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [loadAccount, state]);

  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("checkout") !== "return") return;
    if (!checkoutReturnTracked.current) {
      checkoutReturnTracked.current = true;
      trackEvent("checkout_return_viewed", {
        purchase_count: data.purchases.length,
        pending_purchase: data.purchases.some(
          (purchase) => purchase.status === "pending" || purchase.status === "reserved",
        ),
      });
    }

    for (const purchase of data.purchases) {
      if (purchase.status !== "paid") continue;
      if (checkoutCompletedTracked.current.has(purchase.id)) continue;

      let alreadyTracked = false;
      try {
        const storageKey = `artcovr:analytics:purchase-completed:${purchase.id}`;
        alreadyTracked = sessionStorage.getItem(storageKey) === "1";
        if (!alreadyTracked) sessionStorage.setItem(storageKey, "1");
      } catch {
        // The in-memory set still prevents duplicate events in this session.
      }

      checkoutCompletedTracked.current.add(purchase.id);
      if (!alreadyTracked) {
        trackEvent("purchase_completed", {
          artwork_slug: purchase.artworkSlug,
          sale_mode: purchase.saleMode,
          price_cents: purchase.amountCents,
          currency: purchase.currency,
          included_credits: purchase.includedCredits ?? 0,
        });
      }
    }

    const waitingForWebhook = data.purchases.some(
      (purchase) => purchase.status === "pending" || purchase.status === "reserved",
    );
    if (!waitingForWebhook || checkoutPolls.current >= 15) return;

    const timer = window.setTimeout(() => {
      checkoutPolls.current += 1;
      void loadAccount(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [data.purchases, loadAccount, state]);

  return (
    <PublicPage eyebrow="Account" title="MY IMAGES">
      <CoverArtPreflight />
      {state === "loading" && <p role="status">Loading your images…</p>}
      {state === "ready" && message && (
        <p role="status" className="mb-4 text-sm">{message} Your current edit is preserved. <button type="button" className="underline" onClick={() => void loadAccount(true)}>Refresh account</button></p>
      )}
      {state === "ready" && downloadMessage && (
        <div role="alert" className="mb-6 border-l-2 border-[#a11212] pl-4 dark:border-[#ff6b6b]">
          <p>{downloadMessage}</p>
          <button
            type="button"
            className="link-hover mt-3 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]"
            onClick={() => void loadAccount(true)}
          >
            Retry downloads
          </button>
        </div>
      )}
      {state === "signed-out" && (
        <section className="border-y border-current/20 py-10">
          <p className="text-xl font-bold tracking-tight">Sign in to view your images.</p>
          <p className="mt-3 max-w-[50ch] text-sm leading-6 opacity-70">
            Purchases, edit status, generated images, allowances, expirations, and downloads stay connected here.
          </p>
          <Link href="/sign-in" className="artcovr-button mt-7 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">
            Sign in with email
          </Link>
        </section>
      )}
      {state === "error" && (
        <div role="alert" className="border-l-2 border-[#a11212] pl-4 dark:border-[#ff6b6b]">
          <p>{message}</p>
          <button
            type="button"
            onClick={() => void loadAccount(false)}
            className="link-hover mt-3 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]"
          >
            Try again
          </button>
        </div>
      )}
      {state === "ready" && data.purchases.length === 0 && data.generations.length === 0 && !(data.creditPackPurchases?.length) && (
        <section className="border-y border-current/20 py-10" aria-label="Empty image library">
          <p className="text-xl font-bold">No purchases or generated images yet.</p>
          <p className="mt-3 max-w-[48ch] text-sm leading-6 opacity-70">
            Browse the archive to find a cover, or sign in after a guest purchase to claim it here.
          </p>
          <Link href="/archive" className="artcovr-button mt-6 inline-flex min-h-11 items-center px-5 py-3 text-xs font-bold uppercase tracking-[.08em]">
            Browse the archive
          </Link>
        </section>
      )}
      {state === "ready" && (
        <p className="mb-10 border-y border-current/20 py-4 text-sm">
          <span className="font-bold">{data.totalCreditBalance}</span>{" "}
          image-edit credit{data.totalCreditBalance === 1 ? "" : "s"} available across your account
          {(data.topUpCreditBalance ?? 0) > 0 ? ` · ${data.topUpCreditBalance} from credit packs` : ""}.
        </p>
      )}
      {state === "ready" && (
        <section className="mb-16 border-t-2 border-current pt-5" aria-labelledby="credit-pack-heading">
          <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">Standalone purchase</p>
          <h2 id="credit-pack-heading" className="mt-2 text-3xl font-extrabold tracking-tight">Add image-edit credits</h2>
          <p className="mt-3 max-w-[56ch] text-sm leading-6 text-[var(--muted-foreground)]">
            Use these credits for edits on any artwork you already own. Buying credits does not purchase artwork or extend artwork access.
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="grid gap-2 text-xs font-bold uppercase tracking-[.08em]">
              Credits
              <input
                type="number"
                min={1}
                max={creditPackOptions?.maxCredits ?? 50}
                step={1}
                value={creditPackQuantity}
                onChange={(event) => {
                  creditPackAttempt.current = null;
                  const value = Number(event.target.value);
                  setCreditPackQuantity(Number.isFinite(value) ? value : 0);
                }}
                disabled={!creditPackOptions || creditPackBusy}
                className="min-h-11 w-28 border border-current/30 bg-transparent px-3 text-sm"
              />
            </label>
            {creditPackOptions && (
              <p className="min-h-11 content-center text-sm">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: creditPackOptions.currency,
                }).format((creditPackOptions.creditPriceCents * creditPackQuantity) / 100)}
                {" "}total · {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: creditPackOptions.currency,
                }).format(creditPackOptions.creditPriceCents / 100)} per credit
              </p>
            )}
            <button
              type="button"
              onClick={() => void startCreditPackCheckout()}
              disabled={
                !creditPackOptions ||
                creditPackBusy ||
                !Number.isInteger(creditPackQuantity) ||
                creditPackQuantity < 1 ||
                creditPackQuantity > (creditPackOptions?.maxCredits ?? 0)
              }
              className="artcovr-button inline-flex min-h-11 items-center px-5 py-3 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creditPackBusy ? "Opening checkout…" : "Buy credits"}
            </button>
          </div>
          {creditPackMessage && <p role="status" className="mt-4 text-sm">{creditPackMessage}</p>}
        </section>
      )}
      {state === "ready" && (data.creditPackPurchases?.length ?? 0) > 0 && (
        <section className="mb-16 border-t-2 border-current pt-5" aria-labelledby="credit-pack-history">
          <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">Purchase history</p>
          <h2 id="credit-pack-history" className="mt-2 text-3xl font-extrabold tracking-tight">Credit packs</h2>
          <ol className="mt-6 divide-y divide-current/15 border-y border-current/15">
            {(data.creditPackPurchases ?? []).map((pack) => (
              <li key={pack.id} className="flex flex-wrap items-center justify-between gap-4 py-4 text-sm">
                <div>
                  <p className="font-bold">{pack.credits} image-edit credit{pack.credits === 1 ? "" : "s"} · {pack.status}</p>
                  <p className="mt-1 text-[var(--muted-foreground)]">
                    {pack.remainingCredits} remaining · {formatDate(pack.paidAt)}
                  </p>
                </div>
                <span className="font-bold tabular-nums">
                  {(pack.amountCents / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: pack.currency,
                  })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {state === "ready" && (data.creditActivity?.length ?? 0) > 0 && (
        <section className="mb-16 border-t-2 border-current pt-5" aria-labelledby="credit-activity">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">Account history</p>
              <h2 id="credit-activity" className="mt-2 text-3xl font-extrabold tracking-tight">Credit activity</h2>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">Changes across your purchases.</p>
          </div>
          <ol className="mt-6 divide-y divide-current/15 border-y border-current/15">
            {(data.creditActivity ?? []).map((activity, index) => (
              <li key={`${activity.purchaseId}-${activity.occurredAt}-${activity.event}-${index}`} className="flex items-center justify-between gap-5 py-4 text-sm">
                <div className="min-w-0">
                  <p className="font-bold">{activity.label}</p>
                  <p className="mt-1 truncate text-[var(--muted-foreground)]">
                    {activity.artworkTitle} · <time dateTime={activity.occurredAt}>{formatDate(activity.occurredAt)}</time>
                  </p>
                </div>
                <span className={`shrink-0 font-bold tabular-nums ${activity.amount > 0 ? "text-[var(--signal)] dark:text-[var(--muted-foreground)]" : ""}`}>
                  {activity.amount > 0 ? "+" : ""}{activity.amount}
                </span>
              </li>
            ))}
          </ol>
          {data.creditActivityNextCursor && (
            <button
              type="button"
              className="link-hover mt-5 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]"
              onClick={() => void loadOlderActivity()}
              disabled={loadingOlderActivity}
              aria-busy={loadingOlderActivity}
            >
              {loadingOlderActivity ? "Loading older activity…" : "Load older activity"}
            </button>
          )}
        </section>
      )}
      {state === "ready" && data.purchases.map((purchase) => {
        const purchaseGenerations = data.generations.filter((generation) => generation.purchaseId === purchase.id);
        const downloads = data.downloads.filter((download) => download.purchaseId === purchase.id);
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
              <div><dt className="opacity-60">Credits remaining</dt><dd className="mt-1 font-bold">{purchase.remainingCredits}</dd></div>
              <div><dt className="opacity-60">Access expires</dt><dd className="mt-1 font-bold">{formatDate(purchase.entitlementExpiresAt)}</dd></div>
              <div><dt className="opacity-60">Paid</dt><dd className="mt-1 font-bold">{purchase.paidAt ? `${(purchase.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: purchase.currency })} · ${formatDate(purchase.paidAt)}` : "—"}</dd></div>
            </dl>
            {downloads.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {downloads.map((download) => (
                  <button
                    key={`${download.kind}-${download.generationId || "base"}`}
                    type="button"
                    onClick={() => {
                      trackEvent("download_clicked", {
                        artwork_slug: purchase.artworkSlug,
                        kind: download.kind,
                      });
                      void handleDownload(download);
                    }}
                    className="border border-current px-4 py-3 text-xs font-bold uppercase tracking-[.08em]"
                  >
                    Download {download.kind.replaceAll("_", " ")}
                  </button>
                ))}
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
                accountCreditBalance={data.totalCreditBalance ?? purchase.remainingCredits ?? 0}
                baseImageUrl={baseImageUrl}
                selectedPreviewImageUrl={selectedPreviewImageUrl}
                onGenerationCompleted={refreshAccount}
              />
            )}
            {purchaseGenerations.map((generation) => (
              <AccountGenerationSummary
                key={generation.id}
                generation={generation}
                artworkTitle={purchase.artworkTitle}
                artworkSlug={purchase.artworkSlug}
              />
            ))}
          </article>
        );
      })}
      {state === "ready" && data.generations.filter((generation) => !generation.purchaseId).length > 0 && (
        <section className="border-t-2 border-current pt-5">
          <h2 className="text-3xl font-extrabold tracking-tight">Preview results</h2>
          {data.generations.filter((generation) => !generation.purchaseId).map((generation) => (
            <AccountGenerationSummary
              key={generation.id}
              generation={generation}
              artworkTitle={
                displayArtworks.find((artwork) => artwork.id === generation.artworkId)
                  ?.title ?? "Selected artwork"
              }
              artworkSlug={
                displayArtworks.find((artwork) => artwork.id === generation.artworkId)
                  ?.slug
              }
            />
          ))}
        </section>
      )}
    </PublicPage>
  );
}

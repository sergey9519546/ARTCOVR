"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PurchasedGenerationStudio } from "@/components/artcovr/PurchasedGenerationStudio";
import { PublicPage } from "@/components/artcovr/PublicPage";
import { getArtworkBySlug } from "@/lib/artcovr/artworks";
import { ArtcovrApiError, getMyImages, type AccountData } from "@/lib/artcovr/functions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
    : "—";
}

export default function MyImagesPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "ready" | "error">("loading");
  const [data, setData] = useState<AccountData>({ purchases: [], generations: [], downloads: [] });
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const checkoutPolls = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAccount = useCallback(async (quiet = false) => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      if (mounted.current) {
        setState("error");
        setMessage("Account services are not configured yet.");
      }
      return null;
    }
    if (!quiet && mounted.current) setState("loading");

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      if (mounted.current) setState("signed-out");
      return null;
    }

    try {
      const account = await getMyImages();
      if (mounted.current) {
        setData(account);
        setMessage("");
        setState("ready");
      }
      return account;
    } catch (error) {
      if (mounted.current) {
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
    await loadAccount(true);
  }, [loadAccount]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (state !== "ready" || typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("checkout") !== "return") return;
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
      {state === "loading" && <p role="status">Loading your images…</p>}
      {state === "signed-out" && (
        <section className="border-y border-current/20 py-10">
          <p className="text-xl font-bold tracking-tight">Sign in to view your images.</p>
          <p className="mt-3 max-w-[50ch] text-sm leading-6 opacity-70">
            Purchases, prompts, generated images, allowances, expirations, and downloads stay connected here.
          </p>
          <Link href="/sign-in" className="artcovr-button mt-7 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">
            Sign in with email
          </Link>
        </section>
      )}
      {state === "error" && <p role="alert" className="border-l-2 border-[#a11212] pl-4 dark:border-[#ff6b6b]">{message}</p>}
      {state === "ready" && data.purchases.length === 0 && data.generations.length === 0 && (
        <p className="border-y border-current/20 py-10 text-xl font-bold">No purchases or generated images yet.</p>
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
              <div><dt className="opacity-60">Generations remaining</dt><dd className="mt-1 font-bold">{purchase.remainingGenerations}</dd></div>
              <div><dt className="opacity-60">Access expires</dt><dd className="mt-1 font-bold">{formatDate(purchase.entitlementExpiresAt)}</dd></div>
              <div><dt className="opacity-60">Paid</dt><dd className="mt-1 font-bold">{purchase.paidAt ? `${(purchase.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: purchase.currency })} · ${formatDate(purchase.paidAt)}` : "—"}</dd></div>
            </dl>
            {downloads.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {downloads.map((download) => (
                  <a key={`${download.kind}-${download.generationId || "base"}`} href={download.url} download className="border border-current px-4 py-3 text-xs font-bold uppercase tracking-[.08em]">
                    Download {download.kind.replaceAll("_", " ")}
                  </a>
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

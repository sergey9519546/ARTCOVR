"use client";

import Image from "@/components/compat/Image";
import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { isPromptReady } from "@/lib/artcovr/artworks";
import {
  type AccountGeneration,
  type AccountPurchase,
} from "@/lib/artcovr/functions";
import { trackEvent } from "@/lib/artcovr/analytics";
import { ReferencePhotoInput, useReferencePhoto } from "./ReferencePhotoInput";
import { useGenerationJob } from "./useGenerationJob";

type Props = {
  artwork: Artwork;
  purchase: AccountPurchase;
  generations: AccountGeneration[];
  baseImageUrl?: string;
  selectedPreviewImageUrl?: string;
  onGenerationCompleted(): void | Promise<void>;
};

function terminalMessage(status: "blocked" | "failed" | "timed_out") {
  if (status === "blocked") return "That request could not be generated. Try a different prompt.";
  if (status === "timed_out") {
    return "Generation timed out. Your allowance was not used. Choose Generate image to try again.";
  }
  return "Generation failed. Your allowance was not used. Choose Generate image to try again.";
}

export function PurchasedGenerationStudio({
  artwork,
  purchase,
  generations,
  baseImageUrl,
  selectedPreviewImageUrl,
  onGenerationCompleted,
}: Props) {
  const latestResult = generations.find(
    (generation) => generation.status === "succeeded" && generation.previewUrl,
  );
  const initialSourceId = latestResult?.id ?? (selectedPreviewImageUrl ? purchase.selectedPreviewGenerationId ?? undefined : undefined);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState(
    latestResult?.previewUrl || selectedPreviewImageUrl,
  );
  const [resultIsGenerated, setResultIsGenerated] = useState(Boolean(latestResult?.previewUrl));
  const currentResultId = useRef<string | undefined>(initialSourceId);
  const [selectedVersion, setSelectedVersion] = useState(currentResultId.current ?? "original");
  const [localVersions, setLocalVersions] = useState<Array<{ id: string; previewUrl: string }>>([]);
  const versions = [
    ...localVersions,
    ...generations.filter((generation) => generation.status === "succeeded" && generation.previewUrl && !localVersions.some((local) => local.id === generation.id)),
  ];
  const reference = useReferencePhoto(artwork.id);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const generationStartedAt = useRef<number | undefined>(undefined);
  const resetRequested = useRef(!initialSourceId);
  const [coverTitle, setCoverTitle] = useState("");
  const [coverArtist, setCoverArtist] = useState("");
  const [styleMode, setStyleMode] = useState<"exact" | "expand">("exact");
  const ready = isPromptReady(prompt) && purchase.remainingCredits > 0 && !reference.uploading;

  const { phase, setPhase, message, setMessage, hasPending, start, resume } = useGenerationJob({
    onAccepted(request) { if (request.referenceUploadId) reference.clear(); },
    async onSuccess(status) {
      currentResultId.current = status.generationId;
      setSelectedVersion(status.generationId);
      setLocalVersions((previous) => [{ id: status.generationId, previewUrl: status.previewUrl! }, ...previous.filter((version) => version.id !== status.generationId)]);
      resetRequested.current = false;
      setResult(status.previewUrl);
      setResultIsGenerated(true);
       setMessage("Generated image ready. Your next prompt will build from this result.");
      trackEvent("generation_succeeded", {
        artwork_slug: artwork.slug, surface: "purchased",
        duration_ms: Math.max(0, Date.now() - (generationStartedAt.current ?? Date.now())),
      });
      await onGenerationCompleted();
    },
    onTerminal(status) {
      setMessage(terminalMessage(status));
      trackEvent("generation_failed", { artwork_slug: artwork.slug, surface: "purchased", status });
    },
  });

  useEffect(() => {
    const box = promptBox.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.max(80, Math.min(box.scrollHeight, 240))}px`;
  }, [prompt]);

  function generate() {
    if (phase === "generating") return;
    if (hasPending) { resume(); return; }
    if (!ready) return;
    const title = coverTitle.trim();
    const artistName = coverArtist.trim();
    generationStartedAt.current = Date.now();
    trackEvent("generation_requested", {
      artwork_slug: artwork.slug, surface: "purchased", style_mode: styleMode,
      chained: Boolean(currentResultId.current) && !resetRequested.current,
      has_reference: Boolean(reference.photo?.id), has_cover_text: Boolean(title || artistName),
    });
    setMessage(currentResultId.current && !resetRequested.current ? "Building from your current generated image…" : "Building from the original artwork…");
    start({
      artworkId: artwork.id, purchaseId: purchase.id, prompt: prompt.trim(),
      ...(resetRequested.current ? { resetToBase: true } : { referenceGenerationId: currentResultId.current }),
      referenceUploadId: reference.photo?.id,
      coverText: title || artistName ? { title, artistName } : undefined,
      styleMode,
    });
  }

  function reset() {
    if (hasPending) return;
    currentResultId.current = undefined;
    setSelectedVersion("original");
    resetRequested.current = true;
    setPrompt("");
    setResult(undefined);
    setResultIsGenerated(false);
    setMessage("Returned to the original artwork.");
    setPhase("idle");
  }

  function selectVersion(id: string) {
    if (hasPending) return;
    if (id === "original") { reset(); return; }
    const version = versions.find((generation) => generation.id === id);
    const url = version?.previewUrl ?? (id === purchase.selectedPreviewGenerationId ? selectedPreviewImageUrl : undefined);
    if (!url) return;
    currentResultId.current = id;
    setSelectedVersion(id);
    resetRequested.current = false;
    setResult(url);
    setResultIsGenerated(Boolean(version));
    setMessage("Your next edit will use this version.");
    setPhase("idle");
  }

  const visibleImage = result || baseImageUrl || artwork.image;

  return (
    <section aria-label={`Edit ${purchase.artworkTitle}`} className="mt-8 border-t border-current/20 pt-5">
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tracking-tight">Make it yours.</p>
          <label className="mt-3 block text-xs font-bold">
            Starting image
            <select value={selectedVersion} onChange={(event) => selectVersion(event.target.value)} disabled={hasPending}
              className="ml-3 max-w-full rounded-full border border-current/20 bg-transparent px-3 py-2 font-normal">
              <option value="original">Original artwork</option>
              {purchase.selectedPreviewGenerationId && selectedPreviewImageUrl ? <option value={purchase.selectedPreviewGenerationId}>Purchased preview</option> : null}
              {versions.filter((generation) => generation.id !== purchase.selectedPreviewGenerationId).map((generation, index) =>
                <option key={generation.id} value={generation.id}>Edit {versions.length - index}</option>)}
            </select>
          </label>
          <div className="artcovr-promptbar mt-4 rounded-[1.75rem] p-4">
          <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.12em]">
            <label htmlFor={`paid-prompt-${purchase.id}`} className="opacity-60">Image-edit prompt</label>
            <span className="text-right opacity-45">Make it yours</span>
          </div>
          <textarea
            id={`paid-prompt-${purchase.id}`}
            ref={promptBox}
            maxLength={2000}
            disabled={hasPending}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Put yourself in the scene. Change the light. Make it yours…"
            rows={2}
            className="mt-3 min-h-20 max-h-60 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-base leading-6 outline-none focus:outline-none focus:ring-0"
          />
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="max-w-[26ch] text-[10px] font-bold uppercase leading-4 tracking-[0.08em] opacity-50">Your current cover stays the visual foundation</p>
            <button type="button" onClick={generate}
              disabled={phase === "generating" || (!hasPending && !ready)}
              aria-label={phase === "generating" ? "Generating…" : hasPending ? "Resume generation" : "Generate image"}
              className="artcovr-button inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[11px] font-bold uppercase tracking-[0.1em] disabled:cursor-not-allowed disabled:opacity-40">
              {phase === "generating" ? "Working…" : hasPending ? "Resume" : "Generate"}<span aria-hidden="true">↑</span>
            </button>
          </div>
          </div>
          <ReferencePhotoInput reference={reference} disabled={hasPending} />
          <fieldset className="mt-5 rounded-2xl bg-current/5 p-4" disabled={hasPending}>
            <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.14em]">
              Cover text — rendered into the image
            </legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`paid-cover-title-${purchase.id}`} className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                  Title
                </label>
                <input
                  id={`paid-cover-title-${purchase.id}`}
                  type="text"
                  maxLength={120}
                  value={coverTitle}
                  onChange={(event) => setCoverTitle(event.target.value)}
                  className="mt-1 w-full border border-current/30 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-current"
                />
              </div>
              <div>
                <label htmlFor={`paid-cover-artist-${purchase.id}`} className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                  Artist name
                </label>
                <input
                  id={`paid-cover-artist-${purchase.id}`}
                  type="text"
                  maxLength={120}
                  value={coverArtist}
                  onChange={(event) => setCoverArtist(event.target.value)}
                  placeholder="Your artist or band name"
                  className="mt-1 w-full border border-current/30 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-current"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Style handling">
              <label className={`cursor-pointer border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] ${styleMode === "exact" ? "border-current" : "border-current/30 opacity-60"}`}>
                <input type="radio" name={`paid-style-mode-${purchase.id}`} value="exact" checked={styleMode === "exact"} onChange={() => setStyleMode("exact")} className="sr-only" />
                Match style exactly
              </label>
              <label className={`cursor-pointer border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] ${styleMode === "expand" ? "border-current" : "border-current/30 opacity-60"}`}>
                <input type="radio" name={`paid-style-mode-${purchase.id}`} value="expand" checked={styleMode === "expand"} onChange={() => setStyleMode("expand")} className="sr-only" />
                Expand on it
              </label>
            </div>
          </fieldset>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button type="button" onClick={reset} disabled={hasPending} className="link-hover text-xs font-bold uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-40">
              Reset
            </button>
            <span
              role={phase === "error" ? "alert" : "status"}
              aria-live={phase === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              className="text-xs opacity-60"
            >
               {message || `${purchase.remainingCredits} image-edit credits remaining.`}
            </span>
          </div>
        </div>
        <figure className="artcovr-plate relative order-first aspect-square overflow-hidden rounded-2xl md:order-last">
          <Image
            src={visibleImage}
            alt={resultIsGenerated ? `Generated image based on ${purchase.artworkTitle}` : artwork.alt}
            fill
            unoptimized={visibleImage.startsWith("http")}
            sizes="(min-width: 768px) 288px, 100vw"
            className="object-cover"
          />
          <figcaption className="absolute bottom-0 left-0 bg-[#f3eee6] px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-black">
            {resultIsGenerated
              ? "Generated image"
              : result
                ? "Selected preview"
                : "Original artwork"}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

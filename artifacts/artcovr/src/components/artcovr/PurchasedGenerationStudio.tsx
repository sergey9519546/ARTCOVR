"use client";

import Image from "@/components/compat/Image";
import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { isPromptReady } from "@/lib/artcovr/artworks";
import {
  createGeneration,
  getGenerationStatus,
  uploadReference,
  type AccountGeneration,
  type AccountPurchase,
  type GenerationRequest,
} from "@/lib/artcovr/functions";
import { trackEvent } from "@/lib/artcovr/analytics";

type Props = {
  artwork: Artwork;
  purchase: AccountPurchase;
  generations: AccountGeneration[];
  baseImageUrl?: string;
  selectedPreviewImageUrl?: string;
  onGenerationCompleted(): void | Promise<void>;
};

type Phase = "idle" | "generating" | "complete" | "error";

const ACCEPTED_REFERENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

type ReferenceState =
  | { status: "none" }
  | { status: "uploading"; url: string; name: string }
  | { status: "armed"; url: string; name: string };

function referenceRejection(file: File) {
  if (!(ACCEPTED_REFERENCE_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_REFERENCE_BYTES) return "That file is over the 8 MB limit.";
  return "";
}

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
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState(
    latestResult?.previewUrl || selectedPreviewImageUrl,
  );
  const [resultIsGenerated, setResultIsGenerated] = useState(Boolean(latestResult?.previewUrl));
  const [message, setMessage] = useState("");
  const jobId = useRef<string | undefined>(undefined);
  const currentResultId = useRef<string | undefined>(latestResult?.id);
  const pendingPrompt = useRef("");
  const pendingCover = useRef<{ title?: string; artistName?: string } | undefined>(undefined);
  const pendingStyleMode = useRef<"exact" | "expand">("exact");
  const generationStartedAt = useRef<number | undefined>(undefined);
  const resetRequested = useRef(false);
  const referenceRef = useRef<ReferenceState>({ status: "none" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const armedUploadRef = useRef<string | undefined>(undefined);
  const [reference, setReference] = useState<ReferenceState>({ status: "none" });
  const [armedUploadId, setArmedUploadId] = useState<string | undefined>(undefined);
  const [coverTitle, setCoverTitle] = useState(purchase.artworkTitle);
  const [coverArtist, setCoverArtist] = useState("");
  const [styleMode, setStyleMode] = useState<"exact" | "expand">("exact");
  const ready =
    isPromptReady(prompt) &&
    purchase.remainingGenerations > 0 &&
    reference.status !== "uploading";

  useEffect(() => {
    return () => {
      const current = referenceRef.current;
      if (current.status !== "none") URL.revokeObjectURL(current.url);
    };
  }, []);

  useEffect(() => {
    if (!latestResult || currentResultId.current) return;
    currentResultId.current = latestResult.id;
    setResult(latestResult.previewUrl);
    setResultIsGenerated(true);
  }, [latestResult]);

  useEffect(() => {
    if (phase !== "generating") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: unknown) => {
      if (!active) return;
      setMessage(error instanceof Error ? error.message : "Generation is unavailable.");
      setPhase("error");
    };

    const run = async () => {
      try {
        if (!jobId.current) {
          const shared = {
            artworkId: artwork.id,
            purchaseId: purchase.id,
            prompt: pendingPrompt.current,
            ...(pendingCover.current ? { coverText: pendingCover.current } : {}),
            styleMode: pendingStyleMode.current,
          };
          const referenceUploadId = armedUploadRef.current;
          const request: GenerationRequest = {
            ...shared,
            ...(referenceUploadId ? { referenceUploadId } : {}),
            ...(resetRequested.current
              ? { resetToBase: true }
              : currentResultId.current
                ? { referenceGenerationId: currentResultId.current }
                : {}),
          };
          const created = await createGeneration(request);
          if (referenceUploadId) {
            armedUploadRef.current = undefined;
            setArmedUploadId(undefined);
            const spent = referenceRef.current;
            if (spent.status !== "none") URL.revokeObjectURL(spent.url);
            referenceRef.current = { status: "none" };
            setReference({ status: "none" });
          }
          jobId.current = created.generationId;
        }

        const startedAt = Date.now();
        const MAX_POLL_ATTEMPTS = 90;
        const POLL_DEADLINE_MS = 180_000;
        let attempts = 0;

        const poll = async () => {
          if (Date.now() - startedAt >= POLL_DEADLINE_MS || attempts >= MAX_POLL_ATTEMPTS) {
            setMessage("Generation timed out. Please try again.");
            setPhase("error");
            return;
          }
          attempts += 1;

          const status = await getGenerationStatus(jobId.current!);
          if (!active) return;
          if (status.status === "succeeded") {
            if (!status.previewUrl) {
              setMessage("The generated image is not available yet.");
              setPhase("error");
              return;
            }
            currentResultId.current = status.generationId;
            resetRequested.current = false;
            setResult(status.previewUrl);
            setResultIsGenerated(true);
            setMessage("Generated image ready. Your next prompt will build from this result.");
            setPhase("complete");
            trackEvent("generation_succeeded", {
              artwork_slug: artwork.slug,
              surface: "purchased",
              duration_ms: Math.max(
                0,
                Date.now() - (generationStartedAt.current ?? Date.now()),
              ),
            });
            await onGenerationCompleted();
            return;
          }
          if (
            status.status === "blocked" ||
            status.status === "failed" ||
            status.status === "timed_out"
          ) {
            trackEvent("generation_failed", {
              artwork_slug: artwork.slug,
              surface: "purchased",
              status: status.status,
            });
            setMessage(terminalMessage(status.status));
            setPhase("error");
            return;
          }
          // Only the first poll is awaited by the try below. Every re-entry is
          // a fresh promise chain, so it has to route its own rejection into
          // the same error path or a dropped network/expired token would strand
          // `phase` on "generating" forever.
          timer = setTimeout(() => void poll().catch(fail), 2000);
        };

        await poll();
      } catch (error) {
        fail(error);
      }
    };

    void run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [artwork.id, onGenerationCompleted, phase, purchase.id]);

  function generate() {
    if (!ready || phase === "generating") return;
    pendingPrompt.current = prompt.trim();
    const title = coverTitle.trim();
    const artistName = coverArtist.trim();
    pendingCover.current =
      title || artistName
        ? { ...(title ? { title } : {}), ...(artistName ? { artistName } : {}) }
        : undefined;
    pendingStyleMode.current = styleMode;
    generationStartedAt.current = Date.now();
    trackEvent("generation_requested", {
      artwork_slug: artwork.slug,
      surface: "purchased",
      style_mode: styleMode,
      chained: Boolean(currentResultId.current) && !resetRequested.current,
      has_reference: Boolean(armedUploadRef.current),
      has_cover_text: Boolean(title || artistName),
    });
    jobId.current = undefined;
    setMessage(
      resetRequested.current
        ? "Building from the original artwork…"
        : currentResultId.current
          ? "Building from your current generated image…"
          : "Building from the original artwork…",
    );
    setPhase("generating");
  }

  function setReferenceEverywhere(next: ReferenceState) {
    referenceRef.current = next;
    setReference(next);
  }

  function clearReference() {
    if (reference.status !== "none") URL.revokeObjectURL(reference.url);
    armedUploadRef.current = undefined;
    setArmedUploadId(undefined);
    setReferenceEverywhere({ status: "none" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function pickReference(file: File | undefined) {
    if (!file || reference.status === "uploading" || phase === "generating") return;
    const rejection = referenceRejection(file);
    if (rejection) {
      setMessage(rejection);
      return;
    }
    clearReference();
    const url = URL.createObjectURL(file);
    setReferenceEverywhere({ status: "uploading", url, name: file.name });
    try {
      const { referenceUploadId } = await uploadReference(file, artwork.id);
      armedUploadRef.current = referenceUploadId;
      setArmedUploadId(referenceUploadId);
      setReferenceEverywhere({ status: "armed", url, name: file.name });
      setMessage("Reference photo attached. It will supplement the artwork on your next generation.");
      trackEvent("reference_uploaded", {
        artwork_slug: artwork.slug,
        surface: "purchased",
        media_type: file.type,
      });
    } catch (cause) {
      URL.revokeObjectURL(url);
      setReferenceEverywhere({ status: "none" });
      setMessage(
        cause instanceof Error ? cause.message : "The reference could not be uploaded. Try again.",
      );
    }
  }

  function reset() {
    jobId.current = undefined;
    currentResultId.current = undefined;
    pendingPrompt.current = "";
    resetRequested.current = true;
    setPrompt("");
    setResult(undefined);
    setResultIsGenerated(false);
    setMessage("Returned to the original artwork.");
    setPhase("idle");
  }

  const visibleImage = result || baseImageUrl || artwork.image;

  return (
    <section aria-label={`Edit ${purchase.artworkTitle}`} className="mt-8 border-t border-current/20 pt-5">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">Image editing</p>
          <label htmlFor={`paid-prompt-${purchase.id}`} className="sr-only">Image-edit prompt</label>
          <textarea
            id={`paid-prompt-${purchase.id}`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe any addition, removal, or alteration."
            rows={5}
            className="mt-3 w-full resize-y border border-current/30 bg-transparent px-4 py-4 text-base leading-6 outline-none transition-colors focus:border-current"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_REFERENCE_TYPES.join(",")}
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(event) => void pickReference(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={phase === "generating" || reference.status === "uploading"}
              className="border border-current/30 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors hover:border-current disabled:cursor-not-allowed disabled:opacity-40"
            >
              {armedUploadId ? "Replace reference photo" : "Add reference photo"}
            </button>
            {reference.status !== "none" ? (
              <span className="flex min-w-0 items-center gap-2 text-xs opacity-70">
                <img src={reference.url} alt="" aria-hidden className="size-6 rounded-full object-cover" />
                <span className="max-w-[12rem] truncate">
                  {reference.status === "uploading" ? "Uploading…" : reference.name}
                </span>
                <button
                  type="button"
                  onClick={clearReference}
                  disabled={reference.status === "uploading"}
                  aria-label="Remove the reference photo"
                  className="leading-none opacity-70 hover:opacity-100 disabled:opacity-30"
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-5 opacity-60">
            The artwork stays the primary reference. Add a photo when you want to place a person, face, or other visual element into it.
          </p>
          <fieldset className="mt-4 border border-current/25 p-4" disabled={phase === "generating"}>
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
            <button
              type="button"
              onClick={generate}
              disabled={!ready || phase === "generating"}
              className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "generating" ? "Generating…" : "Generate image"}
            </button>
            <button type="button" onClick={reset} disabled={phase === "generating"} className="link-hover text-xs font-bold uppercase tracking-[.08em] disabled:cursor-not-allowed disabled:opacity-40">
              Reset
            </button>
            <span
              role={phase === "error" ? "alert" : "status"}
              aria-live={phase === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              className="text-xs opacity-60"
            >
              {message || `${purchase.remainingGenerations} generations remaining.`}
            </span>
          </div>
        </div>
        <figure className="artcovr-plate relative aspect-square overflow-hidden">
          <Image
            src={visibleImage}
            alt={resultIsGenerated ? `Generated image based on ${purchase.artworkTitle}` : artwork.alt}
            fill
            unoptimized={visibleImage.startsWith("http")}
            sizes="12rem"
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

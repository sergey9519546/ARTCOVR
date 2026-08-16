"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { isPromptReady } from "@/lib/artcovr/artworks";
import {
  createGeneration,
  getGenerationStatus,
  type AccountGeneration,
  type AccountPurchase,
  type GenerationRequest,
} from "@/lib/artcovr/functions";

type Props = {
  artwork: Artwork;
  purchase: AccountPurchase;
  generations: AccountGeneration[];
  baseImageUrl?: string;
  selectedPreviewImageUrl?: string;
  onGenerationCompleted(): void | Promise<void>;
};

type Phase = "idle" | "generating" | "complete" | "error";

function terminalMessage(status: "blocked" | "failed" | "timed_out") {
  if (status === "blocked") return "That request could not be generated. Try a different prompt.";
  if (status === "timed_out") return "Generation timed out. Your allowance was not used.";
  return "Generation failed. Your allowance was not used.";
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
  const resetRequested = useRef(false);
  const ready = isPromptReady(prompt) && purchase.remainingGenerations > 0;

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
          const request: GenerationRequest = resetRequested.current
            ? {
                artworkId: artwork.id,
                purchaseId: purchase.id,
                prompt: pendingPrompt.current,
                resetToBase: true,
              }
            : {
                artworkId: artwork.id,
                purchaseId: purchase.id,
                prompt: pendingPrompt.current,
                referenceGenerationId: currentResultId.current,
              };
          const created = await createGeneration(request);
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
            await onGenerationCompleted();
            return;
          }
          if (
            status.status === "blocked" ||
            status.status === "failed" ||
            status.status === "timed_out"
          ) {
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
            <span aria-live="polite" className="text-xs opacity-60">
              {message || `${purchase.remainingGenerations} generations remaining.`}
            </span>
          </div>
        </div>
        <figure className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
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

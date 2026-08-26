"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { isPromptReady } from "@/lib/artcovr/artworks";
import {
  createGeneration,
  getGenerationStatus,
  getMyImages,
} from "@/lib/artcovr/functions";
import { CoverTypeControls, CoverTypeLayer, useCoverType } from "./OverlayComposer";
import { PromptComposer } from "./PromptComposer";
import { ReferenceBadge } from "./ReferenceBadge";
import { UploadCard } from "./UploadCard";

type Phase = "idle" | "generating" | "complete" | "error";

function terminalMessage(status: "blocked" | "failed" | "timed_out") {
  if (status === "blocked") return "That request could not be generated. Try a different prompt.";
  if (status === "timed_out") return "Generation timed out. Your allowance was not used.";
  return "Generation failed. Your allowance was not used.";
}

export function PromptStudio({ artwork }: { artwork: Artwork }) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<string>();
  const [message, setMessage] = useState("");
  const [restoring, setRestoring] = useState(true);
  const jobId = useRef<string | undefined>(undefined);
  const currentResultId = useRef<string | undefined>(undefined);
  const resetToBase = useRef(false);
  const pendingPrompt = useRef("");
  const ready = isPromptReady(prompt) && !restoring;
  const selectedPreviewKey = `artcovr:selected-preview:${artwork.id}`;
  const { coverType, updateCoverType } = useCoverType(artwork.id, artwork.title);

  useEffect(() => {
    let active = true;
    let storedGenerationId: string | null = null;
    const clearStoredPreview = () => {
      try {
        sessionStorage.removeItem(selectedPreviewKey);
      } catch {
        // Private browsing can make session storage unavailable.
      }
    };

    try {
      storedGenerationId = sessionStorage.getItem(selectedPreviewKey);
    } catch {
      setRestoring(false);
      return;
    }
    if (!storedGenerationId) {
      setRestoring(false);
      return;
    }

    void (async () => {
      try {
        const account = await getMyImages();
        if (!active) return;
        const savedPreview = account.generations.find(
          (generation) =>
            generation.id === storedGenerationId &&
            generation.artworkId === artwork.id &&
            generation.phase === "preview" &&
            generation.status === "succeeded",
        );
        if (!savedPreview) {
          clearStoredPreview();
          return;
        }

        const status = await getGenerationStatus(storedGenerationId);
        if (!active) return;
        if (status.status === "succeeded" && status.previewUrl) {
          currentResultId.current = status.generationId;
          resetToBase.current = false;
          setResult(status.previewUrl);
          setMessage("Restored your latest generated image.");
          setPhase("complete");
          return;
        }
        clearStoredPreview();
      } catch {
        // Status lookup is authoritative. Leave the identifier in place when a
        // signed-out session cannot validate it; no image or entitlement leaks.
      } finally {
        if (active) setRestoring(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedPreviewKey, artwork.id]);

  useEffect(() => {
    if (phase !== "generating") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fail = (error: unknown) => {
      if (!active) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "Generation requires a signed-in, configured account.",
      );
      setPhase("error");
    };

    const run = async () => {
      try {
        if (!jobId.current) {
          const created = await createGeneration({
            artworkId: artwork.id,
            prompt: pendingPrompt.current,
            referenceGenerationId: currentResultId.current,
            resetToBase: resetToBase.current,
          });
          jobId.current = created.generationId;
        }

        const startedAt = Date.now();
        const MAX_POLL_ATTEMPTS = 90;
        const POLL_DEADLINE_MS = 180_000;
        let attempts = 0;

        const poll = async () => {
          if (Date.now() - startedAt >= POLL_DEADLINE_MS || attempts >= MAX_POLL_ATTEMPTS) {
            setMessage("Generation timed out. Your allowance was not used.");
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
            resetToBase.current = false;
            try {
              sessionStorage.setItem(selectedPreviewKey, status.generationId);
            } catch {}
            setResult(status.previewUrl);
            setMessage("Generated image ready. Your next prompt will build from this result.");
            setPhase("complete");
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
  }, [artwork.id, phase, selectedPreviewKey]);

  function generate() {
    if (!ready || phase === "generating") return;
    pendingPrompt.current = prompt.trim();
    jobId.current = undefined;
    setMessage(
      currentResultId.current
        ? "Building from your current generated image…"
        : "Building from the original artwork…",
    );
    setPhase("generating");
  }

  function reset() {
    jobId.current = undefined;
    currentResultId.current = undefined;
    resetToBase.current = true;
    pendingPrompt.current = "";
    try {
      sessionStorage.removeItem(selectedPreviewKey);
    } catch {}
    setPrompt("");
    setResult(undefined);
    setMessage("Returned to the original artwork.");
    setPhase("idle");
  }

  /**
   * Re-point the reference at the base artwork without discarding the prompt.
   *
   * Same state transition `reset` performs for the reference — the next
   * createGeneration sends no referenceGenerationId and an explicit
   * resetToBase — but the composed prompt survives, because "stop chaining"
   * and "start over" are two different intentions.
   */
  function backToOriginal() {
    if (phase === "generating" || restoring) return;
    jobId.current = undefined;
    currentResultId.current = undefined;
    resetToBase.current = true;
    try {
      sessionStorage.removeItem(selectedPreviewKey);
    } catch {}
    setResult(undefined);
    setMessage("Back to the original artwork. Your prompt was kept.");
    setPhase("idle");
  }

  const busy = phase === "generating" || restoring;
  const previewSrc = result || artwork.image;

  return (
    <section aria-labelledby="direction-title" className="border-t-2 border-current pt-5">
      <div className="max-w-[62ch]">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">
          Generation studio
        </p>
        <h2 id="direction-title" className="mt-2 text-3xl font-extrabold tracking-tight md:text-5xl">
          Describe any change.
        </h2>
        <p className="mt-3 text-sm leading-6 opacity-70">
          Start from this artwork, steer it with the controls below, and edit the compiled prompt by
          hand at any time. Each successful result becomes the starting image for your next prompt.
        </p>
      </div>

      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,.88fr)] lg:gap-14">
        <div className="min-w-0">
          <ReferenceBadge
            imageSrc={previewSrc}
            title={result ? `Latest result from ${artwork.title}` : artwork.title}
            kind={result ? "generated" : "artwork"}
            onReset={backToOriginal}
            resetDisabled={busy}
          />

          <PromptComposer
            artwork={artwork}
            value={prompt}
            onChange={setPrompt}
            disabled={phase === "generating"}
          />

          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">
            Compiled prompt
          </p>
          <p className="mt-1 text-[11px] leading-4 opacity-60">
            Everything above writes into this box. Edit it freely — this exact text is what gets
            sent.
          </p>
          <label htmlFor="prompt" className="sr-only">Describe the change you want</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="For example: keep the atmosphere and introduce a midnight-blue skyline."
            rows={6}
            className="mt-2 w-full resize-y border border-current/30 bg-transparent px-4 py-4 text-base leading-6 outline-none transition-colors focus:border-current"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={generate}
              disabled={!ready || phase === "generating" || restoring}
              className="artcovr-button px-5 py-3 text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "generating" ? "Generating…" : "Generate image"}
            </button>
            <button type="button" onClick={reset} disabled={phase === "generating" || restoring} className="link-hover text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
              Reset
            </button>
            <span aria-live="polite" className="text-xs opacity-60">
              {message || (restoring ? "Restoring your selected preview…" : ready ? "Sign in to request a preview." : "Enter at least eight characters.")}
            </span>
          </div>

          <UploadCard artworkId={artwork.id} />
        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <figure className="artcovr-plate artcovr-cover-frame relative aspect-square overflow-hidden">
            <Image
              src={previewSrc}
              alt={result ? `Generated image based on ${artwork.title}` : artwork.alt}
              fill
              unoptimized={Boolean(result)}
              sizes="(min-width: 1024px) 35vw, 100vw"
              className="object-cover"
            />
            <CoverTypeLayer state={coverType} />
            {phase === "generating" ? (
              <div className="absolute inset-0 grid place-items-center bg-[var(--background)]/90">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Generating…</p>
              </div>
            ) : null}
            <figcaption className="absolute bottom-0 left-0 bg-[var(--background)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--foreground)]">
              {result ? "Generated image — watermarked preview" : "Original artwork"}
            </figcaption>
          </figure>

          <CoverTypeControls
            state={coverType}
            onChange={updateCoverType}
            disabled={phase === "generating"}
          />
        </div>
      </div>
    </section>
  );
}

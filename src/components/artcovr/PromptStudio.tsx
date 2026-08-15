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
  }, [selectedPreviewKey]);

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

        const poll = async () => {
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

  return (
    <section aria-labelledby="direction-title" className="border-t border-current pt-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)] lg:gap-12">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">
            Image editing
          </p>
          <h2 id="direction-title" className="mt-2 text-3xl font-extrabold tracking-tight">
            Describe any change.
          </h2>
          <p className="mt-3 max-w-[52ch] text-sm leading-6 opacity-70">
            Use one freeform prompt to add, remove, or alter anything. Each successful result becomes the starting image for your next prompt.
          </p>
          <label htmlFor="prompt" className="sr-only">Describe the change you want</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="For example: keep the atmosphere and introduce a midnight-blue skyline."
            rows={7}
            className="mt-6 w-full resize-y border border-current/30 bg-transparent px-4 py-4 text-base leading-6 outline-none transition-colors focus:border-current"
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
        </div>
        <figure className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
          <Image
            src={result || artwork.image}
            alt={result ? `Generated image based on ${artwork.title}` : artwork.alt}
            fill
            unoptimized={Boolean(result)}
            sizes="(min-width: 1024px) 35vw, 100vw"
            className="object-cover"
          />
          <figcaption className="absolute bottom-0 left-0 bg-[#f3eee6] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black">
            {result ? "Generated image" : "Original artwork"}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

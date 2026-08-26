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
  const pendingCover = useRef<{ title?: string; artistName?: string } | undefined>(undefined);
  const pendingStyleMode = useRef<"exact" | "expand">("exact");
  const ready = isPromptReady(prompt) && !restoring;
  const selectedPreviewKey = `artcovr:selected-preview:${artwork.id}`;
  const [coverTitle, setCoverTitle] = useState(artwork.title);
  const [coverArtist, setCoverArtist] = useState("");
  const [styleMode, setStyleMode] = useState<"exact" | "expand">("exact");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [referenceThumb, setReferenceThumb] = useState<{ url: string; name: string } | undefined>(undefined);
  const clearUploadRef = useRef<(() => void) | undefined>(undefined);
  const promptBoxRef = useRef<HTMLTextAreaElement | null>(null);
  const [armedUploadId, setArmedUploadId] = useState<string | undefined>(undefined);
  const armedUploadRef = useRef<string | undefined>(undefined);

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
          // An armed upload and a chained result are mutually exclusive on the
          // server (dual_reference_conflict): the upload applies its style to
          // the ORIGINAL artwork, so it wins and the chain id is omitted.
          const referenceUploadId = armedUploadRef.current;
          const created = await createGeneration({
            artworkId: artwork.id,
            prompt: pendingPrompt.current,
            ...(referenceUploadId
              ? { referenceUploadId }
              : { referenceGenerationId: currentResultId.current }),
            resetToBase: resetToBase.current,
            ...(pendingCover.current ? { coverText: pendingCover.current } : {}),
            styleMode: pendingStyleMode.current,
          });
          // Admission consumed the upload (single-use); a request rejected
          // BEFORE admission threw above and keeps the reference armed.
          if (referenceUploadId) {
            armedUploadRef.current = undefined;
            setArmedUploadId(undefined);
          }
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

  /** Chat-style input: grow with content, cap at roughly eight lines. */
  function autosizePromptBox() {
    const box = promptBoxRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 200)}px`;
  }

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

          <fieldset className="mt-6 border border-current/25 p-4" disabled={phase === "generating"}>
            <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.14em]">
              Cover text — rendered into the image
            </legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cover-title" className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                  Title
                </label>
                <input
                  id="cover-title"
                  type="text"
                  maxLength={120}
                  value={coverTitle}
                  onChange={(event) => setCoverTitle(event.target.value)}
                  className="mt-1 w-full border border-current/30 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-current"
                />
              </div>
              <div>
                <label htmlFor="cover-artist" className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                  Artist name
                </label>
                <input
                  id="cover-artist"
                  type="text"
                  maxLength={120}
                  value={coverArtist}
                  onChange={(event) => setCoverArtist(event.target.value)}
                  placeholder="Your artist or band name"
                  className="mt-1 w-full border border-current/30 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-current"
                />
              </div>
            </div>
          </fieldset>

          <UploadCard
            artworkId={artwork.id}
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            onPreviewChange={(url, name) =>
              setReferenceThumb(url && name ? { url, name } : undefined)
            }
            registerClear={(clear) => {
              clearUploadRef.current = clear;
            }}
            armedUploadId={armedUploadId}
            onArm={(id) => {
              armedUploadRef.current = id;
              setArmedUploadId(id);
            }}
            onDisarm={() => {
              armedUploadRef.current = undefined;
              setArmedUploadId(undefined);
            }}
          />

          {/* The bar itself is pinned to the panel foot: content above scrolls
              past while the input stays in reach, chat-app style. */}
          <div className="sticky bottom-4 mt-6">
            <label htmlFor="prompt" className="sr-only">Describe the image you want</label>
            <div className="artcovr-promptbar flex items-end gap-2 rounded-[1.75rem] border border-current/30 p-2">
              <button
                type="button"
                onClick={() => setUploadOpen((open) => !open)}
                aria-expanded={uploadOpen}
                aria-label={armedUploadId ? "Style reference attached — manage" : "Attach a style reference image"}
                className={`grid size-9 shrink-0 place-items-center rounded-full border text-lg leading-none transition-colors ${armedUploadId ? "artcovr-button border-current" : "border-current/30 hover:border-current"}`}
              >
                +
              </button>
              {referenceThumb || armedUploadId ? (
                <span className="flex shrink-0 items-center gap-1 self-center rounded-full border border-current/30 py-1 pl-1 pr-2">
                  {referenceThumb ? (
                    /* Local object URL, never a catalog asset. */
                    <img src={referenceThumb.url} alt={`Reference: ${referenceThumb.name}`} className="size-7 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-current/10 text-[10px] font-bold">ref</span>
                  )}
                  <button
                    type="button"
                    onClick={() => clearUploadRef.current?.()}
                    aria-label="Remove the style reference"
                    className="text-[13px] leading-none opacity-60 transition-opacity hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ) : null}
              <textarea
                id="prompt"
                ref={promptBoxRef}
                value={prompt}
                maxLength={2000}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  autosizePromptBox();
                }}
                onKeyDown={(event) => {
                  // The usual chatbox contract: Enter sends, Shift+Enter breaks a line.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    generate();
                  }
                }}
                placeholder="Describe the image you want…"
                rows={1}
                aria-keyshortcuts="Enter"
                className="max-h-[200px] min-h-9 w-full resize-none self-center bg-transparent px-2 py-1.5 text-base leading-6 outline-none"
              />
              <button
                type="button"
                onClick={generate}
                disabled={!ready || phase === "generating" || restoring}
                aria-label={phase === "generating" ? "Generating…" : "Generate image"}
                className="artcovr-button grid size-9 shrink-0 place-items-center rounded-full text-lg leading-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === "generating" ? (
                  <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <span aria-hidden="true">↑</span>
                )}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em]">
              {/* The only live control here is the style preset; the rest state
                  facts the backend fixes per tier — selectors for them would be
                  dead controls, which this repo bans. */}
              <div role="radiogroup" aria-label="Style preset" className="flex gap-1">
                <label className={`cursor-pointer rounded-full border px-3 py-1 ${styleMode === "exact" ? "border-current" : "border-current/30 opacity-60"}`}>
                  <input type="radio" name="style-mode" value="exact" checked={styleMode === "exact"} onChange={() => setStyleMode("exact")} className="sr-only" />
                  Exact style
                </label>
                <label className={`cursor-pointer rounded-full border px-3 py-1 ${styleMode === "expand" ? "border-current" : "border-current/30 opacity-60"}`}>
                  <input type="radio" name="style-mode" value="expand" checked={styleMode === "expand"} onChange={() => setStyleMode("expand")} className="sr-only" />
                  Expand
                </label>
              </div>
              <span className="rounded-full border border-current/20 px-3 py-1 opacity-60">1:1</span>
              <span className="rounded-full border border-current/20 px-3 py-1 opacity-60">1024 px preview</span>
              <span className="rounded-full border border-current/20 px-3 py-1 opacity-60">1 image</span>
              <span className="ml-auto tabular-nums opacity-60" aria-label={`${prompt.length} of 2000 characters`}>
                {prompt.length}/2000
              </span>
            </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button type="button" onClick={reset} disabled={phase === "generating" || restoring} className="link-hover text-xs font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
              Reset
            </button>
            <span aria-live="polite" className="text-xs opacity-60">
              {message || (restoring ? "Restoring your selected preview…" : ready ? "Sign in to request a preview." : "Enter at least eight characters.")}
            </span>
          </div>

          </div>

        </div>

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <figure className="artcovr-plate relative aspect-square overflow-hidden">
            <Image
              src={previewSrc}
              alt={result ? `Generated image based on ${artwork.title}` : artwork.alt}
              fill
              unoptimized={Boolean(result)}
              sizes="(min-width: 1024px) 35vw, 100vw"
              className="object-cover"
            />
            {phase === "generating" ? (
              <div className="absolute inset-0 grid place-items-center bg-[var(--background)]/90">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Generating…</p>
              </div>
            ) : null}
            <figcaption className="absolute bottom-0 left-0 bg-[var(--background)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--foreground)]">
              {result ? "Generated image — watermarked preview" : "Original artwork"}
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

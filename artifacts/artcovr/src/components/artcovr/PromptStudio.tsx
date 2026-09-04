"use client";

import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { isPromptReady } from "@/lib/artcovr/artworks";
import { useArtcovrAuth } from "@/lib/artcovr/auth";
import {
  createGeneration,
  getGenerationStatus,
  getMyImages,
  uploadReference,
} from "@/lib/artcovr/functions";
import { PromptComposer } from "./PromptComposer";

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

export function PromptStudio({ artwork }: { artwork: Artwork }) {
  const { isLoaded, isSignedIn } = useArtcovrAuth();
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
  const ready = isPromptReady(prompt) && !restoring && isLoaded && isSignedIn;
  const authRedirect =
    typeof window === "undefined"
      ? `/product/${artwork.slug}`
      : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authRedirectQuery = `?redirect_url=${encodeURIComponent(authRedirect)}`;
  const selectedPreviewKey = `artcovr:selected-preview:${artwork.id}`;
  const [coverTitle, setCoverTitle] = useState(artwork.title);
  const [coverArtist, setCoverArtist] = useState("");
  const [styleMode, setStyleMode] = useState<"exact" | "expand">("exact");
  const [coverOpen, setCoverOpen] = useState(false);
  const [reference, setReference] = useState<ReferenceState>({ status: "none" });
  const referenceRef = useRef<ReferenceState>({ status: "none" });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  /**
   * Picking a file uploads it immediately: validate, show the chip as
   * uploading, exchange the bytes for an opaque single-use id, arm it. On any
   * failure the chip disappears and the reason lands in the status line.
   */
  async function pickReference(file: File | undefined) {
    if (!file || reference.status === "uploading") return;
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
      setMessage("Style reference attached. It applies to your next generation.");
    } catch (cause) {
      URL.revokeObjectURL(url);
      setReferenceEverywhere({ status: "none" });
      setMessage(
        cause instanceof Error ? cause.message : "The reference could not be uploaded. Try again.",
      );
    }
  }

  const busy = phase === "generating" || restoring;
  const previewSrc = result || artwork.image;
  const coverSummary = [coverTitle.trim(), coverArtist.trim()].filter(Boolean).join(" · ");

  return (
    <section aria-labelledby="direction-title" className="border-t-2 border-current pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="direction-title" className="text-2xl font-extrabold tracking-tight md:text-3xl">
          Make it yours.
        </h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-60">
          Generation studio
        </p>
      </div>

      <div className="mx-auto mt-6 w-full max-w-[640px]">
        {/* THE CANVAS. Everything below acts on this one image. */}
        <figure className="artcovr-plate relative aspect-square overflow-hidden rounded-2xl">
          <Image
            src={previewSrc}
            alt={result ? `Generated image based on ${artwork.title}` : artwork.alt}
            fill
            unoptimized={Boolean(result)}
            sizes="(min-width: 768px) 640px, 100vw"
            className="object-cover"
          />
          {phase === "generating" ? (
            <div className="absolute inset-0 grid place-items-center bg-[var(--background)]/90">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Generating…</p>
            </div>
          ) : null}
          <figcaption className="absolute bottom-2 left-2 rounded-full bg-[var(--background)]/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em]">
            {result ? "Watermarked preview" : "Original artwork"}
          </figcaption>
        </figure>

        {/* CONTEXT STRIP: what the next generation builds from, and its two
            optional parameters. One row, all chip-scale. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
          <span className="flex items-center gap-2 rounded-full border border-current/25 py-1 pl-1 pr-3">
            <Image
              src={previewSrc}
              alt=""
              aria-hidden
              width={24}
              height={24}
              unoptimized={Boolean(result)}
              className="size-6 rounded-full object-cover"
            />
            <span className="opacity-70">from</span>
            <span>{result ? "Latest result" : "Original artwork"}</span>
            {result ? (
              <button
                type="button"
                onClick={backToOriginal}
                disabled={busy}
                aria-label="Back to the original artwork"
                className="ml-1 leading-none opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
              >
                ×
              </button>
            ) : null}
          </span>

          {reference.status !== "none" ? (
            <span className="flex items-center gap-2 rounded-full border border-current/25 py-1 pl-1 pr-3">
              {/* Local object URL, never a catalog asset. */}
              <img src={reference.url} alt="" aria-hidden className="size-6 rounded-full object-cover" />
              <span className="max-w-[10rem] truncate">
                {reference.status === "uploading" ? "Uploading…" : reference.name}
              </span>
              <button
                type="button"
                onClick={clearReference}
                disabled={reference.status === "uploading"}
                aria-label="Remove the style reference"
                className="ml-1 leading-none opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
              >
                ×
              </button>
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setCoverOpen((open) => !open)}
            aria-expanded={coverOpen}
            className={`rounded-full border px-3 py-1 transition-colors ${coverOpen || coverSummary ? "border-current" : "border-current/25 opacity-70 hover:opacity-100"}`}
          >
            {coverSummary ? `Cover text: ${coverSummary}` : "Add cover text"}
          </button>

          <div role="radiogroup" aria-label="Style handling" className="ml-auto flex gap-1">
            <label className={`cursor-pointer rounded-full border px-3 py-1 ${styleMode === "exact" ? "border-current" : "border-current/25 opacity-60"}`}>
              <input type="radio" name="style-mode" value="exact" checked={styleMode === "exact"} onChange={() => setStyleMode("exact")} className="sr-only" />
              Exact style
            </label>
            <label className={`cursor-pointer rounded-full border px-3 py-1 ${styleMode === "expand" ? "border-current" : "border-current/25 opacity-60"}`}>
              <input type="radio" name="style-mode" value="expand" checked={styleMode === "expand"} onChange={() => setStyleMode("expand")} className="sr-only" />
              Expand
            </label>
          </div>
        </div>

        {coverOpen ? (
          <div className="mt-2 grid gap-3 rounded-2xl border border-current/25 p-3 sm:grid-cols-2">
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
                disabled={phase === "generating"}
                className="mt-1 w-full border-b border-current/30 bg-transparent px-1 py-1.5 text-sm outline-none transition-colors focus:border-current"
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
                disabled={phase === "generating"}
                className="mt-1 w-full border-b border-current/30 bg-transparent px-1 py-1.5 text-sm outline-none transition-colors focus:border-current"
              />
            </div>
            <p className="text-[11px] leading-4 opacity-60 sm:col-span-2">
              Rendered into the generated image, spelled exactly as written.
            </p>
          </div>
        ) : null}

        {/* THE BAR, pinned in reach while the canvas scrolls. */}
        <div className="sticky bottom-4 mt-4">
          <label htmlFor="prompt" className="sr-only">Describe the image you want</label>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void pickReference(event.dataTransfer.files?.[0]);
            }}
            className="artcovr-promptbar flex items-end gap-2 rounded-[1.75rem] border border-current/30 p-2"
          >
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
              aria-label={armedUploadId ? "Style reference attached — replace it" : "Attach a style reference image"}
              className={`grid size-9 shrink-0 place-items-center rounded-full border text-lg leading-none transition-colors ${armedUploadId ? "artcovr-button border-current" : "border-current/30 hover:border-current"}`}
            >
              +
            </button>
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

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
             <span aria-live="polite" className="min-w-0 flex-1 opacity-70">
               {message ||
                 (restoring
                   ? "Restoring your selected preview…"
                   : !isLoaded
                     ? "Checking your account…"
                     : !isSignedIn
                       ? "Sign in to request a preview."
                       : ready
                         ? "Ready to request a preview."
                         : "Enter at least eight characters.")}
            </span>
            <button type="button" onClick={reset} disabled={phase === "generating" || restoring} className="link-hover font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40">
              Reset
            </button>
            <span className="opacity-50">1:1 · 1024 px · 1 image</span>
            <span className="tabular-nums opacity-50" aria-label={`${prompt.length} of 2000 characters`}>
              {prompt.length}/2000
            </span>
          </div>
        </div>

         {isLoaded && !isSignedIn ? (
           <section className="mt-4 border-y border-current/20 py-4" aria-label="Preview account access">
             <p className="text-sm font-bold">Sign in to make a preview.</p>
             <p className="mt-2 max-w-[52ch] text-xs leading-5 opacity-70">
               Your prompt and this artwork will still be here when you return. Preview generation is available to signed-in accounts.
             </p>
             <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-[0.08em]">
               <Link href={`/sign-in${authRedirectQuery}`} className="link-hover">
                 Sign in
               </Link>
               <Link href={`/sign-up${authRedirectQuery}`} className="link-hover">
                 Create an account
               </Link>
             </div>
           </section>
         ) : null}

        <PromptComposer
          artwork={artwork}
          value={prompt}
          onChange={setPrompt}
          disabled={phase === "generating"}
        />
      </div>
    </section>
  );
}

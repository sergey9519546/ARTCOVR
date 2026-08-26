"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Style-reference upload — UI seam only.
 *
 * The transport (`uploadReference(file, artworkId) -> { referenceUploadId }`)
 * is being added to src/lib/artcovr/functions.ts by a separate change. Until
 * that export exists and the server-side reference-resolution contract is
 * wired, this card MUST NOT make a network call: an unresolved client file is
 * not an authoritative reference source. The flag below is the single switch.
 */
const REFERENCE_UPLOAD_ENABLED: boolean = false;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;
const ACCEPT_ATTR = ACCEPTED.join(",");
const MAX_BYTES = 8 * 1024 * 1024;

function rejectionFor(file: File) {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_BYTES) return "That file is over the 8 MB limit.";
  return "";
}

export function UploadCard({ artworkId }: { artworkId: string }) {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const rejection = rejectionFor(candidate);
    if (rejection) {
      setFile(undefined);
      setError(rejection);
      return;
    }
    setError("");
    setFile(candidate);
  }

  function clear() {
    setFile(undefined);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function useAsReference() {
    if (!REFERENCE_UPLOAD_ENABLED || !file) return;
    // === SEAM ===
    // When `uploadReference` ships, this is the only place it is called:
    //
    //   const { referenceUploadId } = await uploadReference(file, artworkId);
    //
    // and `referenceUploadId` is then handed to the studio so the next
    // createGeneration({ artworkId, prompt, referenceGenerationId }) call can
    // carry it. Nothing else in this component talks to the network, and the
    // server stays the authority on what a reference may resolve to.
    void artworkId;
  }

  return (
    <section aria-labelledby="upload-reference-title" className="mt-6 border border-current/25 p-4">
      <h3 id="upload-reference-title" className="text-[11px] font-bold uppercase tracking-[0.12em]">
        Use your own image as a style reference
      </h3>
      <p className="mt-1 max-w-[52ch] text-[11px] leading-4 opacity-60">
        Drop a JPEG, PNG, or WebP up to 8 MB. Files stay in your browser for now — reference upload
        is coming online shortly.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={`mt-4 border border-dashed p-4 transition-colors ${
          dragging ? "border-current bg-current/5" : "border-current/40"
        }`}
      >
        {previewUrl && file ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* Local object URL, never a catalog asset: next/image would only
                add a loader between the browser and its own blob. */}
            <img
              src={previewUrl}
              alt={`Selected style reference: ${file.name}`}
              className="artcovr-plate size-20 shrink-0 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{file.name}</p>
              <p className="mt-0.5 text-[11px] opacity-60">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={clear}
              className="link-hover shrink-0 text-[11px] font-bold uppercase tracking-[0.08em]"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1 text-sm opacity-70">
              Drag an image here, or choose a file from your device.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 border border-current/40 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors hover:border-current"
            >
              Choose file
            </button>
          </div>
        )}
        <label htmlFor="reference-upload" className="sr-only">
          Choose a style reference image
        </label>
        <input
          ref={inputRef}
          id="reference-upload"
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={useAsReference}
          disabled={!REFERENCE_UPLOAD_ENABLED || !file}
          className="artcovr-button px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Use as reference
        </button>
        <span role="status" className="text-[11px] opacity-60">
          {error || (REFERENCE_UPLOAD_ENABLED ? "" : "Coming online shortly.")}
        </span>
      </div>
    </section>
  );
}

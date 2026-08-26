"use client";

import { useEffect, useRef, useState } from "react";
import { uploadReference } from "@/lib/artcovr/functions";

/**
 * Style-reference upload.
 *
 * The card never names a bucket, path or URL: `uploadReference` posts the raw
 * bytes and returns an opaque single-use id that only the server can resolve
 * (decode, bounds, re-encode; original bytes never persist). The parent studio
 * owns the armed id and sends it as `referenceUploadId` on the next
 * generation, which consumes it.
 */

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

export function UploadCard({
  artworkId,
  open,
  onOpenChange,
  armedUploadId,
  onArm,
  onDisarm,
  onPreviewChange,
  registerClear,
}: {
  artworkId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  armedUploadId?: string;
  onArm: (referenceUploadId: string) => void;
  onDisarm: () => void;
  /** Reports the selected file's thumbnail URL so the bar can show a chip. */
  onPreviewChange?: (url: string | undefined, name: string | undefined) => void;
  /** Hands the parent a stable way to clear the selection from the bar chip. */
  registerClear?: (clear: () => void) => void;
}) {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(undefined);
      onPreviewChange?.(undefined, undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    onPreviewChange?.(url, file.name);
    return () => URL.revokeObjectURL(url);
    // onPreviewChange is a parent setState wrapper; identity churn is harmless
    // and depending on it would revoke/recreate the object URL every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    onDisarm();
  }

  const clearRef = useRef(clear);
  clearRef.current = clear;
  useEffect(() => {
    registerClear?.(() => clearRef.current());
    // registered once; the ref keeps the latest closure without re-registering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function armReference() {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      const { referenceUploadId } = await uploadReference(file, artworkId);
      onArm(referenceUploadId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The reference could not be uploaded. Try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <details
      className="group mt-6 border border-current/25"
      open={open || Boolean(file || armedUploadId)}
      onToggle={(event) => onOpenChange((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em]">
        <span aria-hidden="true" className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        Use your own image as a style reference
      </summary>
      <div className="px-4 pb-4">
      <p className="mt-1 max-w-[52ch] text-[11px] leading-4 opacity-60">
        JPEG, PNG or WebP, up to 8 MB. It applies to your next generation, then it is used up.
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
          onClick={() => void armReference()}
          disabled={!file || uploading || Boolean(armedUploadId)}
          className="artcovr-button px-4 py-2 text-[11px] font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? "Uploading…" : "Use as reference"}
        </button>
        <span role="status" className="text-[11px] opacity-60">
          {error ||
            (armedUploadId
              ? "Style reference armed — it applies to your next generation, then it is used up."
              : "")}
        </span>
      </div>
      </div>
    </details>
  );
}

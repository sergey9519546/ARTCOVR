"use client";

import Image from "next/image";

/**
 * Surfaces the image the next generation will actually build from.
 *
 * The server already treats the picked artwork (or the current generated
 * result, when the user chains) as the reference; this component only makes
 * that existing behaviour legible. It sends nothing and decides nothing.
 */
export function ReferenceBadge({
  imageSrc,
  title,
  kind,
  onReset,
  resetDisabled,
}: {
  imageSrc: string;
  title: string;
  kind: "artwork" | "generated";
  onReset?: () => void;
  resetDisabled?: boolean;
}) {
  const generated = kind === "generated";

  return (
    <div className="flex flex-wrap items-center gap-4 border border-current/25 p-3">
      <div className="artcovr-plate relative size-16 shrink-0 overflow-hidden">
        <Image
          src={imageSrc}
          alt=""
          aria-hidden="true"
          fill
          unoptimized={generated}
          sizes="64px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">
          Generating from
        </p>
        <p className="mt-1 truncate text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 opacity-60">
          {generated
            ? "Your latest generated result is the reference for the next prompt."
            : "The original artwork is the reference for your next prompt."}
        </p>
      </div>
      {generated && onReset ? (
        <button
          type="button"
          onClick={onReset}
          disabled={resetDisabled}
          className="link-hover shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back to original artwork
        </button>
      ) : null}
    </div>
  );
}

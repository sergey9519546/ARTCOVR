"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { displayGenreLabel, getArtworkGenres, type Artwork } from "@/lib/artcovr/artworks";
import { rankSimilarArtwork, type ArtworkSimilarityMode } from "@/lib/artcovr/discovery-index";

const WORKS_PER_BATCH = 24;
const MODES = [
  { value: "visual", label: "Image connections", noun: "image connections", description: "The closest recorded matches in color, texture and composition." },
  { value: "palette", label: "Shared palette", noun: "palette matches", description: "Works sharing a palette or color family with this cover." },
  { value: "mood", label: "Shared mood", noun: "mood matches", description: "Works sharing mood labels with this cover." },
] as const;

type RelatedWorksProps = { seed: Artwork; items: readonly Artwork[] };

export function RelatedWorks(props: RelatedWorksProps) {
  // Product-to-product SPA navigation must start a fresh trail and page count.
  return <RelatedWorksForSeed key={props.seed.id + ":" + props.seed.slug} {...props} />;
}

function RelatedWorksForSeed({ seed, items }: RelatedWorksProps) {
  const [mode, setMode] = useState<ArtworkSimilarityMode>("visual");
  const [visibleCount, setVisibleCount] = useState(WORKS_PER_BATCH);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  const matchesByMode = useMemo(() => ({
    visual: rankSimilarArtwork(seed, items, "visual"),
    palette: rankSimilarArtwork(seed, items, "palette"),
    mood: rankSimilarArtwork(seed, items, "mood"),
  }), [seed, items]);
  const matches = matchesByMode[mode];
  const selectedMode = MODES.find(({ value }) => value === mode)!;
  const visibleWorks = matches.slice(0, visibleCount);
  const remainingCount = Math.max(matches.length - visibleCount, 0);
  const nextBatchCount = Math.min(remainingCount, WORKS_PER_BATCH);
  const trailHref = `/archive?similar=${encodeURIComponent(seed.slug)}${mode === "visual" ? "" : `&mode=${mode}`}`;

  useEffect(() => {
    const index = pendingFocusIndex.current;
    if (index === null) return;
    pendingFocusIndex.current = null;
    // Newly added links precede Load more in DOM order. Continue the keyboard
    // journey at the first new work, including when the final button disappears.
    resultsRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-related-artwork]")[index]?.focus({ preventScroll: true });
  }, [visibleCount]);

  return (
    <section aria-labelledby="related-works" className="mt-24 border-t-2 border-current pt-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="related-works" className="text-[11px] font-bold uppercase tracking-[.1em]">Find similar</h2>
          <p className="mt-2 max-w-[50ch] text-sm leading-6 text-[var(--muted-foreground)]">
            Follow what draws you to <span className="font-bold text-[var(--foreground)]">{seed.title}</span>.
          </p>
        </div>
        <Link href={trailHref} className="link-hover inline-flex min-h-11 shrink-0 items-center self-start text-[11px] font-bold uppercase tracking-[.1em]">
          Explore this visual trail <span aria-hidden="true" className="ml-2">↗</span>
        </Link>
      </div>

      <div role="group" aria-label="Explore similar artwork" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-current/20">
        {MODES.map(({ value, label }) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            aria-controls="related-results"
            onClick={() => { pendingFocusIndex.current = null; setMode(value); setVisibleCount(WORKS_PER_BATCH); }}
            className={`min-h-11 border-b-2 py-3 text-[11px] font-bold uppercase tracking-[.08em] ${mode === value ? "border-current" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            {label} <span className="ml-1 tabular-nums">{matchesByMode[value].length}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">{selectedMode.description}</p>
      <p role="status" aria-live="polite" className="mt-2 text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">
        Showing {visibleWorks.length} of {matches.length} {selectedMode.noun}
      </p>

      <div id="related-results" ref={resultsRef}>
        {matches.length === 0 ? (
          <div className="mt-8 border-y border-current/20 py-8">
            <p className="text-lg font-bold">No {selectedMode.noun} are available yet.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              Try another connection above or browse the full archive.
            </p>
            <Link href="/archive" className="link-hover mt-5 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]">
              Browse the archive
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:gap-x-6">
            {visibleWorks.map(({ artwork, reasons }) => (
              <li key={artwork.id}>
                <Link href={`/product/${artwork.slug}`} data-related-artwork className="group block" aria-label={`Open ${artwork.title}`}>
                  <div className="artcovr-plate relative aspect-square overflow-hidden">
                    <Image src={artwork.image} alt={artwork.alt} fill unoptimized loading="lazy" sizes="(min-width: 768px) 33vw, 50vw" className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none" />
                  </div>
                  <p className="mt-3 text-lg leading-5">{artwork.title}</p>
                </Link>
                <p data-discovery-reason className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{reasons.join(" · ")}</p>
                <p className="mt-2 flex flex-wrap gap-x-3 text-[11px] uppercase text-[var(--muted-foreground)]">
                  {getArtworkGenres(artwork).slice(0, 2).map((genre) => (
                    <Link key={genre} href={`/archive?genre=${encodeURIComponent(genre)}`} className="link-hover inline-flex min-h-6 items-center">
                      {displayGenreLabel(genre)}
                    </Link>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {remainingCount > 0 ? (
        <button
          type="button"
          className="artcovr-button mt-12 px-5 py-4 text-[11px] font-bold uppercase tracking-[.1em]"
          onClick={() => {
            pendingFocusIndex.current = visibleWorks.length;
            setVisibleCount((count) => count + WORKS_PER_BATCH);
          }}
        >
          Load {nextBatchCount} more · {remainingCount} remaining
        </button>
      ) : matches.length > 0 ? (
        <p className="mt-12 text-[10px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]">
          All {selectedMode.noun} shown
        </p>
      ) : null}
    </section>
  );
}

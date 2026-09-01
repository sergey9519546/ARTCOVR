"use client";

import { useState } from "react";
import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import {
  displayGenreLabel,
  getArtworkGenres,
  type Artwork,
} from "@/lib/artcovr/artworks";

const WORKS_PER_BATCH = 24;

export function RelatedWorks({ works }: { works: readonly Artwork[] }) {
  const [visibleCount, setVisibleCount] = useState(WORKS_PER_BATCH);
  const visibleWorks = works.slice(0, visibleCount);
  const remainingCount = Math.max(works.length - visibleCount, 0);

  return (
    <section aria-labelledby="related-works" className="mt-24 border-t-2 border-current pt-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="related-works" className="text-[11px] font-bold uppercase tracking-[.1em]">Find similar</h2>
          <p className="mt-2 max-w-[50ch] text-sm leading-6 opacity-60">
            Image-nearest works first, followed by a deep pool of shared visual traits across the approved catalog.
          </p>
        </div>
        <Link href="/archive" className="link-hover shrink-0 text-[11px] font-bold uppercase tracking-[.1em]">Browse archive</Link>
      </div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[.1em] opacity-50">
        {works.length} approved visual neighbors
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
        {visibleWorks.map((related) => (
          <li key={related.id}>
            <Link href={`/product/${related.slug}`} className="group block" aria-label={`Open ${related.title}`}>
              <div className="artcovr-plate relative aspect-square overflow-hidden">
                <Image src={related.image} alt={related.alt} fill unoptimized loading="lazy" sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] group-hover:scale-[1.04]" />
              </div>
              <p className="mt-3 text-lg leading-5">{related.title}</p>
              <p className="mt-[6px] text-[11px] uppercase opacity-60">
                {getArtworkGenres(related).slice(0, 2).map(displayGenreLabel).join(" · ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {remainingCount > 0 ? (
        <button
          type="button"
          className="artcovr-button mt-12 px-5 py-4 text-[11px] font-bold uppercase tracking-[.1em]"
          onClick={() => setVisibleCount((count) => count + WORKS_PER_BATCH)}
        >
          Load 24 more · {remainingCount} remaining
        </button>
      ) : (
        <p className="mt-12 text-[10px] font-bold uppercase tracking-[.1em] opacity-50">
          End of approved visual neighbors
        </p>
      )}
    </section>
  );
}
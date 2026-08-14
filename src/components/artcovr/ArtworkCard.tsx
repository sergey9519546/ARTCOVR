import Image from "next/image";
import Link from "next/link";
import { getVisualStyleLabel, isCheckoutReady, type Artwork } from "@/lib/artcovr/artworks";
import { humanizeVisualLabel } from "@/lib/artcovr/visual-index";

export function ArtworkCard({ artwork, priority = false }: { artwork: Artwork; priority?: boolean }) {
  // Machine style label from the committed visual index; absent for any work
  // that is not indexed, in which case the card renders exactly as before.
  const styleLabel = getVisualStyleLabel(artwork.slug);
  return (
    <article className="group">
      <Link href={`/product/${artwork.slug}`} className="block" aria-label={`View ${artwork.title}`}>
        <div className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
          <Image src={artwork.image} alt={artwork.alt} fill preload={priority} loading={priority ? "eager" : "lazy"} sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
        </div>
        <div className="mt-3 flex items-start justify-between gap-4 text-xs font-bold uppercase tracking-[.06em]">
          <div>
            <h2 className="text-base normal-case tracking-tight">{artwork.title}</h2>
            <p className="mt-1 opacity-60">
              {isCheckoutReady(artwork)
                ? artwork.saleMode === "exclusive"
                  ? "Exclusive license available"
                  : "Commercial license available"
                : "Availability pending"}
            </p>
            {styleLabel ? (
              <p className="mt-1 text-[10px] uppercase tracking-[.12em] opacity-40">
                {humanizeVisualLabel(styleLabel)}
              </p>
            ) : null}
          </div>
          <span aria-hidden="true">↗</span>
        </div>
      </Link>
    </article>
  );
}

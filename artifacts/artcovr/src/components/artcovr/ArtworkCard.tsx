import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import { ArrowUpRight, Bookmark, Waypoints } from "lucide-react";
import {
  displayGenreLabel,
  getArtworkGenres,
  isCheckoutReady,
  type Artwork,
} from "@/lib/artcovr/artworks";

export function ArtworkCard({ artwork, priority = false, compact = false, saved = false, onSave, onSimilar, reasons }: {
  artwork: Artwork; priority?: boolean; compact?: boolean; saved?: boolean;
  onSave?: (artwork: Artwork) => void;
  onSimilar?: (artwork: Artwork) => void;
  reasons?: readonly string[];
}) {
  const genres = getArtworkGenres(artwork);
  return (
    <article className="group min-w-0">
      <Link href={`/product/${artwork.slug}`} className="block" aria-label={`View ${artwork.title}`}>
        <div className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
          <Image src={artwork.image} alt={artwork.alt} fill preload={priority} loading={priority ? "eager" : "lazy"} sizes={compact ? "(min-width: 1024px) 17vw, (min-width: 768px) 25vw, 50vw" : "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"} className="object-cover transition-transform duration-700 motion-reduce:transition-none group-hover:scale-[1.02] motion-reduce:group-hover:scale-100" />
        </div>
        <div className="mt-3 flex items-start justify-between gap-4 text-xs font-bold uppercase tracking-[.06em]">
          <div>
            <h2 className="text-base normal-case tracking-tight">{artwork.title}</h2>
            <p className="mt-1 opacity-60">
              {isCheckoutReady(artwork)
                ? artwork.saleMode === "exclusive"
                  ? "Exclusive license available"
                  : "Non-exclusive license available"
                : "Availability pending"}
            </p>
            {genres.length > 0 ? (
              <p className="mt-1 text-[10px] uppercase tracking-[.12em] text-current/70">
                {genres.slice(0, 2).map(displayGenreLabel).join(" · ")}
              </p>
            ) : null}
          </div>
          <ArrowUpRight size={16} className="shrink-0" aria-hidden="true" />
        </div>
      </Link>
      {reasons?.length ? <p className="mt-3 text-xs leading-5 text-current/70" data-match-reason>{reasons.slice(0, 2).join(" · ")}</p> : null}
      {(onSave || onSimilar) && <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-current/15 pt-1">
        {onSimilar && <button type="button" className="discovery-card-action" aria-label={`Find similar to ${artwork.title}`} onClick={() => onSimilar(artwork)}><Waypoints size={15} aria-hidden="true" /> Find similar</button>}
        {onSave && <button type="button" className="discovery-card-action" aria-pressed={saved} aria-label={saved ? `Remove ${artwork.title} from crate` : `Save ${artwork.title} to crate`} onClick={() => onSave(artwork)}><Bookmark size={15} fill={saved ? "currentColor" : "none"} aria-hidden="true" /> {saved ? "Saved" : "Save"}</button>}
      </div>}
    </article>
  );
}

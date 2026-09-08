import type { Artwork } from "@/lib/artcovr/artworks";
import { ArtworkCard } from "./ArtworkCard";

export function ArtworkGrid({ items, compact = false, savedSlugs, onSave, onSimilar, reasons }: {
  items: Artwork[];
  compact?: boolean;
  savedSlugs?: ReadonlySet<string>;
  onSave?: (artwork: Artwork) => void;
  onSimilar?: (artwork: Artwork) => void;
  reasons?: ReadonlyMap<string, string[]>;
}) {
  return <div className={compact ? "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:grid-cols-6" : "grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16"} data-density={compact ? "compact" : "gallery"}>
    {items.map((artwork, index) => <ArtworkCard key={artwork.id} artwork={artwork} priority={index < 2} compact={compact} saved={savedSlugs?.has(artwork.slug)} onSave={onSave} onSimilar={onSimilar} reasons={reasons?.get(artwork.slug)} />)}
  </div>;
}

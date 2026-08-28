import type { Artwork } from "@/lib/artcovr/artworks";
import { ArtworkCard } from "./ArtworkCard";

export function ArtworkGrid({ items }: { items: Artwork[] }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16">
    {items.map((artwork, index) => <ArtworkCard key={artwork.id} artwork={artwork} priority={index < 2} />)}
  </div>;
}

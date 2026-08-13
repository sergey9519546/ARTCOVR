import { ProductCard } from "./ProductCard";
import { displayArtworks } from "@/lib/artcovr/artworks";

function CardAt({ index, priority = false }: { index: number; priority?: boolean }) {
  const artwork = displayArtworks[index];
  return artwork ? <ProductCard artwork={artwork} priority={priority} /> : null;
}

function hasRange(start: number, end: number) {
  return displayArtworks.slice(start, end).length > 0;
}

export function ProductGrid() {
  if (displayArtworks.length === 0) return null;
  const remainingArtworks = displayArtworks.slice(13);
  return (
    <section className="px-4 lg:px-6" aria-labelledby="selected-artworks">
      <h2 id="selected-artworks" className="sr-only">
        Selected cover artwork
      </h2>
      <div className={`${displayArtworks.length > 4 ? "mb-34" : "mb-16"} grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6`}>
        {[0, 1, 2, 3].map((index) => (
          <CardAt key={displayArtworks[index]?.id ?? index} index={index} priority={index === 0} />
        ))}
      </div>
      {hasRange(4, 7) && <div className="mb-34 grid grid-cols-8 gap-6 md:grid-cols-16">
        <div className="col-span-3"><CardAt index={4} /></div>
        <div className="col-span-3"><CardAt index={5} /></div>
        <div className="col-start-3 col-end-9 md:col-start-9 md:-col-end-1"><CardAt index={6} /></div>
      </div>}
      {hasRange(7, 10) && <div className="mb-34 grid grid-cols-8 gap-6 md:grid-cols-16">
        <div className="col-span-4 md:col-span-3"><CardAt index={7} /></div>
        <div className="col-start-3 col-end-6 md:col-start-6 md:col-end-9"><CardAt index={8} /></div>
        <div className="col-start-6 col-end-9 md:col-start-9 md:col-end-12"><CardAt index={9} /></div>
      </div>}
      {hasRange(10, 13) && <div className="mb-34 grid grid-cols-8 gap-6 md:grid-cols-16">
        <div className="col-span-5"><CardAt index={10} /></div>
        <div className="col-start-2 col-end-5 md:col-start-11 md:col-end-[14]"><CardAt index={11} /></div>
        <div className="col-start-5 col-end-9 md:col-start-[14] md:col-end-[17]"><CardAt index={12} /></div>
      </div>}
      {remainingArtworks.length > 0 && (
        <div className="mb-34 grid grid-cols-2 gap-x-4 gap-y-16 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-24">
          {remainingArtworks.map((artwork) => (
            <ProductCard key={artwork.id} artwork={artwork} />
          ))}
        </div>
      )}
    </section>
  );
}

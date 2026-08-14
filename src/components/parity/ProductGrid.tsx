import { ProductCard } from "./ProductCard";
import { displayArtworks } from "@/lib/artcovr/artworks";

function hasRange(min: number, max: number) {
  return displayArtworks.length >= min && displayArtworks.length <= max;
}

export function ProductGrid() {
  if (displayArtworks.length === 0) return null;
  const isPartialCatalog = hasRange(4, 7);
  const remainingArtworks = displayArtworks.slice(13);
  const firstRow = displayArtworks.slice(0, 13);
  const uniformRowClass = "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-y-12 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16";
  const firstRowSpacing = isPartialCatalog ? "mb-6 md:mb-8" : "mb-10 md:mb-12";

  return (
    <section className="px-4 lg:px-6" aria-labelledby="selected-artworks">
      <h2 id="selected-artworks" className="sr-only">
        Selected cover artwork
      </h2>

      <div className={`${uniformRowClass} ${firstRowSpacing}`}>
        {firstRow.map((artwork, index) => (
          <ProductCard key={artwork.id} artwork={artwork} priority={index === 0} />
        ))}
      </div>

      {remainingArtworks.length > 0 && (
        <div className={`${uniformRowClass} mb-10 md:mb-14`}>
          {remainingArtworks.map((artwork) => (
            <ProductCard key={artwork.id} artwork={artwork} />
          ))}
        </div>
      )}
    </section>
  );
}

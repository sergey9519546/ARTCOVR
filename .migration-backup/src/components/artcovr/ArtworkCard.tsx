import Image from "next/image";
import Link from "next/link";
import {
  getCheckoutTotal,
  getVisualStyleLabel,
  isCheckoutReady,
  type Artwork,
} from "@/lib/artcovr/artworks";
import { humanizeVisualLabel } from "@/lib/artcovr/visual-index";

export function ArtworkCard({ artwork, priority = false }: { artwork: Artwork; priority?: boolean }) {
  // Machine style label from the committed visual index; absent for any work
  // that is not indexed, in which case the card renders exactly as before.
  const styleLabel = getVisualStyleLabel(artwork.slug);
  const checkoutReady = isCheckoutReady(artwork);
  const availabilityLabel = checkoutReady
    ? artwork.saleMode === "exclusive"
      ? "Exclusive license available"
      : "Repeatable license available"
    : "Availability pending";
  const priceLabel = checkoutReady
    ? getCheckoutTotal(artwork.priceCents)
    : "Price pending approval";

  return (
    <article className="group">
      <Link
        href={`/product/${artwork.slug}`}
        className="block"
        aria-label={`View ${artwork.title}. ${availabilityLabel}. ${priceLabel}.`}
      >
        <div className="relative aspect-square overflow-hidden bg-[#e9e2d7]">
          <Image src={artwork.image} alt={artwork.alt} fill preload={priority} loading={priority ? "eager" : "lazy"} sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
        </div>
        <div className="mt-3">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-bold tracking-tight">{artwork.title}</h2>
            <span aria-hidden="true" className="shrink-0">↗</span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-xs font-bold uppercase tracking-[.06em] text-current/80">
              {availabilityLabel}
            </p>
            <p className="text-sm font-bold tracking-tight">{priceLabel}</p>
          </div>
          {styleLabel ? (
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[.1em] text-current/75">
              {humanizeVisualLabel(styleLabel)}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

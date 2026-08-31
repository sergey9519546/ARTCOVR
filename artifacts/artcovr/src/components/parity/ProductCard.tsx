"use client";

import { memo } from "react";
import Image from "@/components/compat/Image";
import Link from "@/components/compat/Link";
import {
  getCheckoutTotal,
  type Artwork,
} from "@/lib/artcovr/artworks";

const ARTWORK_IMAGE_FALLBACK = "/assets/artwork-placeholder.svg";

export const ProductCard = memo(function ProductCard({
  artwork,
  priority = false,
}: {
  artwork: Artwork;
  priority?: boolean;
}) {
  return (
    <Link
      className="group block"
      data-artwork="true"
      data-cursor="text"
      href={`/product/${artwork.slug}`}
      aria-label={`Open ${artwork.title}`}
    >
      <div
        className="relative aspect-square overflow-hidden bg-[#d2cac3] dark:bg-neutral-800"
        data-inview="true"
      >
        <Image
          alt={artwork.alt}
          draggable={false}
          fill
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          unoptimized
          className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] group-hover:scale-[1.04]"
          src={artwork.image}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 40vw, 80vw"
          onError={(event) => {
            const image = event.currentTarget;
            if (image.dataset.artworkFallback === "true") return;
            image.dataset.artworkFallback = "true";
            image.src = ARTWORK_IMAGE_FALLBACK;
          }}
        />
      </div>
      <div className="mt-3 flex flex-col justify-between gap-2 text-lg leading-5 md:flex-row">
        <p>{artwork.title}</p>
        <p className="text-sm opacity-60">
          {getCheckoutTotal(artwork.priceCents)}
        </p>
      </div>
      <div className="mt-[6px] flex items-center gap-1 text-[11px] uppercase">
        <div className="h-2 w-2 rounded-full bg-current" />
        <span>{artwork.category}</span>
      </div>
    </Link>
  );
});

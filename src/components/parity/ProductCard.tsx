"use client";

import { memo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getCheckoutTotal,
  type Artwork,
} from "@/lib/artcovr/artworks";

export const ProductCard = memo(function ProductCard({
  artwork,
  priority = false,
}: {
  artwork: Artwork;
  priority?: boolean;
}) {
  const [imageError, setImageError] = useState(false);

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
        {imageError ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-xs uppercase opacity-50">
            {artwork.title}
          </div>
        ) : (
          <>
            <Image
              alt={artwork.alt}
              draggable={false}
              fill
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              unoptimized
              className="object-cover"
              src={artwork.image}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 40vw, 80vw"
              onError={() => setImageError(true)}
            />
            <Image
              aria-hidden="true"
              alt=""
              draggable={false}
              fill
              loading="lazy"
              unoptimized
              className="scale-[1.18] object-cover brightness-[0.82] contrast-[1.08] transition-all duration-500 ease-[cubic-bezier(0.87,0,0.13,1)] [clip-path:polygon(0%_0%,_0%_0%,_0%_100%,_0%_100%)] group-hover:scale-[1.04] group-hover:brightness-100 group-hover:contrast-100 group-hover:[clip-path:polygon(0%_0%,_100%_0%,_100%_100%,_0%_100%)]"
              src={artwork.image}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 40vw, 80vw"
            />
          </>
        )}
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

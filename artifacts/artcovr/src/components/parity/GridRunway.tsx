"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { homepageArtworkGroups } from "@/lib/artcovr/homepage-artwork-groups";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import { ProductCard } from "./ProductCard";

const GRID_RUNWAY_START = 12;
export const GRID_RUNWAY_END = Math.min(
  GRID_RUNWAY_START + 5,
  homepageArtworkGroups.grid.length,
);
const RUNWAY_ITEMS = homepageArtworkGroups.grid.slice(
  GRID_RUNWAY_START,
  GRID_RUNWAY_END,
);

/**
 * This is an ordinary product-grid row on a horizontal rail. Card dimensions,
 * metadata and column gaps stay identical to the surrounding catalog; scroll
 * changes only the rail's x position, and reversing scroll reverses the rail.
 */
export function GridRunway() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    const cards = Array.from(
      track.querySelectorAll<HTMLAnchorElement>('a[data-artwork="true"]'),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const card = entry.target as HTMLAnchorElement;
          const canInteract = entry.isIntersecting && entry.intersectionRatio >= 0.01;
          card.tabIndex = canInteract ? 0 : -1;
          card.style.pointerEvents = canInteract ? "auto" : "none";
        }
      },
      { root, threshold: [0, 0.01] },
    );

    cards.forEach((card) => {
      card.tabIndex = -1;
      card.style.pointerEvents = "none";
      observer.observe(card);
    });

    return () => {
      observer.disconnect();
      cards.forEach((card) => {
        card.removeAttribute("tabindex");
        card.style.removeProperty("pointer-events");
      });
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || RUNWAY_ITEMS.length < 2) return;

    gsap.registerPlugin(ScrollTrigger);
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    let context: gsap.Context | null = null;
    const syncMotion = () => {
      context?.revert();
      context = null;
      delete root.dataset.runwayMotion;
      if (mediaQuery.matches) return;

      root.dataset.runwayMotion = "true";

      context = gsap.context(() => {
        gsap.fromTo(
          track,
          { x: 0 },
          {
            x: () => -Math.max(0, track.scrollWidth - root.clientWidth),
            ease: "none",
            scrollTrigger: {
              trigger: root,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          },
        );
      }, root);
    };
    syncMotion();
    mediaQuery.addEventListener("change", syncMotion);

    return () => {
      mediaQuery.removeEventListener("change", syncMotion);
      context?.revert();
      delete root.dataset.runwayMotion;
    };
  }, []);

  if (RUNWAY_ITEMS.length === 0) return null;

  return (
    <div
      ref={rootRef}
      data-artwork-runway
      className="relative col-span-full overflow-x-auto data-[runway-motion=true]:overflow-hidden"
    >
      <div
        ref={trackRef}
        data-runway-track
        className="grid w-full grid-flow-col auto-cols-[calc((100%_-_1rem)/2)] gap-x-4 will-change-transform md:auto-cols-[calc((100%_-_2rem)/3)] lg:auto-cols-[calc((100%_-_4.5rem)/4)] lg:gap-x-6"
      >
        {RUNWAY_ITEMS.map((artwork) => (
          <ProductCard key={artwork.id} artwork={artwork} />
        ))}
      </div>
    </div>
  );
}

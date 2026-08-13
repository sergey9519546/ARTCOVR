"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { displayArtworks } from "@/lib/artcovr/artworks";

const MAX_SPIRAL_ITEMS = 40;
function sampleSpiralItems(offset: number) {
  if (displayArtworks.length <= MAX_SPIRAL_ITEMS) return displayArtworks;
  return Array.from({ length: MAX_SPIRAL_ITEMS }, (_, index) => {
    const sourceIndex = Math.floor(
      (index * displayArtworks.length) / MAX_SPIRAL_ITEMS,
    );
    return displayArtworks[(sourceIndex + offset) % displayArtworks.length];
  });
}
const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse)";

export function SpiralScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<ReturnType<typeof ScrollTrigger.create> | null>(null);
  const [staticMode, setStaticMode] = useState(false);
  const ITEMS = sampleSpiralItems(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setStaticMode(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    if (staticMode || ITEMS.length < 2 || !sectionRef.current || !stageRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const section = sectionRef.current;
    const stage = stageRef.current;
    const label = labelRef.current;
    const itemElements = stage.querySelectorAll<HTMLElement>(".spiral-item");
    const radius = 350;
    const verticalSpacing = Math.max(34, 1500 / ITEMS.length);
    const turns = Math.max(2.5, ITEMS.length / 10);
    const positions = ITEMS.map((_, index) => {
      const itemProgress = index / (ITEMS.length - 1);
      const angle = itemProgress * turns * Math.PI * 2;
      return {
        x: Math.cos(angle) * radius,
        y: (index - ITEMS.length / 2) * verticalSpacing,
        z: Math.sin(angle) * radius,
        scale: 1 - itemProgress * 0.4,
        revealStart: (index / ITEMS.length) * 0.8,
        revealEnd: (index / ITEMS.length) * 0.8 + 0.2,
      };
    });

    gsap.set(itemElements, {
      x: 0,
      y: 0,
      z: 0,
      scale: 0.3,
      opacity: 0,
      rotationY: 0,
    });
    triggerRef.current = ScrollTrigger.create({
      trigger: section,
      start: "top top",
      end: "+=6000",
      pin: true,
      scrub: 1,
      onUpdate: ({ progress }) => {
        const revealEnd = 0.7;
        const revealProgress = Math.min(progress / revealEnd, 1);
        itemElements.forEach((element, index) => {
          const position = positions[index];
          if (revealProgress < position.revealStart) {
            gsap.set(element, { x: 0, y: 0, z: 0, scale: 0.3, opacity: 0 });
            return;
          }
          const localProgress = Math.min(
            1,
            Math.max(
              0,
              (revealProgress - position.revealStart) /
                (position.revealEnd - position.revealStart),
            ),
          );
          gsap.set(element, {
            x: position.x * localProgress,
            y: position.y * localProgress,
            z: position.z * localProgress,
            scale: 0.3 + (position.scale - 0.3) * localProgress,
            opacity: localProgress,
          });
        });

        if (progress > revealEnd) {
          const rotationProgress = (progress - revealEnd) / (1 - revealEnd);
          gsap.set(stage, {
            rotationY: rotationProgress * 120,
            scale: 1 + rotationProgress * 0.4,
          });
        } else {
          gsap.set(stage, { rotationY: 0, scale: 1 });
        }

        if (label) {
          const index = Math.min(ITEMS.length - 1, Math.floor(progress * ITEMS.length));
          const itemProgress = (progress * ITEMS.length) % 1;
          const opacity =
            itemProgress < 0.15
              ? itemProgress / 0.15
              : itemProgress > 0.85
                ? (1 - itemProgress) / 0.15
                : 1;
          if (label.textContent !== ITEMS[index].title) {
            label.textContent = ITEMS[index].title;
          }
          label.style.opacity = String(opacity);
        }
      },
      onLeaveBack: () => {
        gsap.set(itemElements, { x: 0, y: 0, z: 0, scale: 0.3, opacity: 0 });
        gsap.set(stage, { rotationY: 0, scale: 1 });
        if (label) label.style.opacity = "0";
      },
    });

    return () => {
      triggerRef.current?.kill();
      triggerRef.current = null;
      gsap.set(stage, { clearProps: "transform" });
      gsap.set(itemElements, { clearProps: "transform,opacity" });
    };
  }, [staticMode]);

  if (ITEMS.length === 0) return null;

  if (staticMode || ITEMS.length < 2) {
    const staticItems = displayArtworks;
    return (
      <section className="bg-black px-4 py-20 text-cream" aria-label="ARTCOVR archive sequence">
        <div className="mb-10 flex items-center justify-between text-xs font-bold uppercase tracking-tight">
          <span>ARTCOVR archive</span>
          <Link href="/archive" className="border-b border-current pb-1">View all</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {staticItems.map((artwork) => (
            <Link
              key={artwork.id}
              href={`/product/${artwork.slug}`}
              data-artwork="true"
              className="group block"
            >
              <img
                src={artwork.image}
                alt={artwork.alt}
                width={320}
                height={320}
                loading="lazy"
                className="aspect-square w-full object-cover transition-opacity group-hover:opacity-80"
              />
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-tight">
                {artwork.title}
              </span>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label="ARTCOVR spiral archive"
      className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-black"
      style={{ perspective: "1600px" }}
    >
      <div className="absolute top-24 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-3 text-sm font-bold uppercase tracking-tight text-cream">
        <span className="border-b border-cream pb-0.5">archive</span>
        <span className="opacity-30">•</span>
        <span className="opacity-50">spiral</span>
      </div>
      <div className="absolute top-24 right-6 z-[4]">
        <Link
          href="/archive"
          className="flex items-center gap-2 rounded-full border border-cream/20 px-4 py-2 text-xs font-bold uppercase tracking-tight text-cream transition-colors hover:bg-cream/10"
        >
          archive <span className="h-1.5 w-1.5 rounded-full bg-cream" />
        </Link>
      </div>
      <div className="absolute bottom-8 left-6 z-10 text-xs font-bold uppercase tracking-tight text-cream/40">
        ARTCOVR® • COVER ARCHIVE • 2026
      </div>
      <div
        ref={stageRef}
        className="absolute top-0 left-0 h-full w-full will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        {ITEMS.map((artwork) => (
          <Link
            key={artwork.id}
            href={`/product/${artwork.slug}`}
            data-artwork="true"
            aria-label={`View ${artwork.title}`}
            className="spiral-item absolute top-1/2 left-1/2 -mt-[70px] -ml-[70px] h-[140px] w-[140px] will-change-transform"
            style={{ transformStyle: "preserve-3d" }}
          >
            <span className="block h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl">
              <img
                src={artwork.image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                width={140}
                height={140}
              />
            </span>
          </Link>
        ))}
      </div>
      <div
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-32 left-1/2 z-20 -translate-x-1/2 rounded-full bg-cream px-6 py-3 text-sm font-bold uppercase tracking-tight text-black transition-opacity duration-300"
        style={{ opacity: 0 }}
      />
    </section>
  );
}

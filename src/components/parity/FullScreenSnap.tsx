"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { displayArtworks } from "@/lib/artcovr/artworks";

const MARQUEE =
  "COVER ART, MADE YOURS • SELECT AN ARTWORK • PROMPT A CHANGE • KEEP ITERATING • PURCHASE AND DOWNLOAD • ";
const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse)";

const SECTIONS = [
  {
    id: "select",
    bg: "bg-cream",
    fg: "text-black",
    title: "ARTCOVR",
    sub: "Curated cover art",
    desc: "Start with one carefully selected square artwork.",
    artworkIndex: 1,
    layout: "right-image",
  },
  {
    id: "prompt",
    bg: "bg-black",
    fg: "text-cream",
    title: "Prompt",
    sub: "Any change",
    desc: "Describe what you want to add, remove, or transform in one freeform prompt.",
    artworkIndex: 4,
    layout: "left-image",
  },
  {
    id: "iterate",
    bg: "bg-red",
    fg: "text-cream",
    title: "Make it",
    sub: "your own",
    desc: "Each visible result becomes the starting point for your next prompt. Reset returns to the original.",
    layout: "center-text",
  },
  {
    id: "purchase",
    bg: "bg-cream",
    fg: "text-black",
    title: "One artwork",
    sub: "One checkout",
    desc: "Review the artwork and your chosen result before purchasing through a focused checkout.",
    artworkIndex: 7,
    layout: "split",
  },
  {
    id: "library",
    bg: "bg-black",
    fg: "text-cream",
    title: "Your images",
    sub: "Ready when you are",
    desc: "Purchased originals and successful generated images stay together in My Images.",
    layout: "center-text",
  },
] as const;

export function FullScreenSnap() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [staticMode, setStaticMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setStaticMode(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let animationFrame = 0;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? false),
      { threshold: 0.1 },
    );
    observer.observe(wrapper);

    if (staticMode) {
      return () => observer.disconnect();
    }

    const updateMarquee = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const currentWrapper = wrapperRef.current;
        const marquee = marqueeRef.current;
        if (!currentWrapper || !marquee) return;
        const rect = currentWrapper.getBoundingClientRect();
        const travel = Math.max(1, rect.height - window.innerHeight);
        const progress = Math.max(0, Math.min(1, -rect.top / travel));
        marquee.style.transform = `translateX(${-progress * 50}%)`;
      });
    };

    window.addEventListener("scroll", updateMarquee, { passive: true });
    window.addEventListener("resize", updateMarquee, { passive: true });
    updateMarquee();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateMarquee);
      window.removeEventListener("resize", updateMarquee);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [staticMode]);

  if (displayArtworks.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`${staticMode ? "absolute" : "fixed"} top-0 left-0 right-0 z-[2] flex h-12 items-center overflow-hidden border-b border-current/10 bg-cream/90 backdrop-blur-sm transition-opacity duration-300 ${inView ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!inView}
        inert={!inView ? true : undefined}
      >
        <div
          ref={marqueeRef}
          className="whitespace-nowrap text-xs font-bold tracking-tight uppercase will-change-transform"
        >
          {Array.from({ length: 8 }).map((_, index) => (
            <span key={index} className="mx-4">{MARQUEE}</span>
          ))}
        </div>
      </div>
      <div
        className={`${staticMode ? "absolute" : "fixed"} bottom-6 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-6 rounded-full bg-black/90 px-6 py-3 text-sm font-bold text-cream shadow-lg backdrop-blur-sm transition-opacity duration-300 ${inView ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <span>ARTCOVR</span>
        <span className="opacity-50" aria-hidden="true">|</span>
        <Link href="/archive" className="link-hover">Archive</Link>
      </div>
      <div style={{ scrollSnapType: staticMode ? "none" : "y proximity" }}>
        {SECTIONS.map((section) => {
          const artwork = "artworkIndex" in section
            ? displayArtworks[section.artworkIndex % displayArtworks.length]
            : undefined;
          return (
            <section
              key={section.id}
              className={`flex min-h-screen w-full items-center justify-center px-4 pt-12 lg:px-6 ${section.bg} ${section.fg}`}
              style={{ scrollSnapAlign: staticMode ? "none" : "start" }}
            >
              <div className="w-full max-w-6xl">
                {section.layout === "center-text" && (
                  <div className="mx-auto max-w-4xl text-center">
                    <h2 className="text-[15vw] leading-[0.9] font-[900] tracking-tighter md:text-[10vw]">{section.title}</h2>
                    <p className="mt-4 text-2xl font-bold tracking-tight opacity-80 md:text-4xl">{section.sub}</p>
                    <p className="mx-auto mt-8 max-w-md text-sm opacity-60 md:text-base">{section.desc}</p>
                  </div>
                )}
                {section.layout === "right-image" && (
                  <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
                    <SnapCopy section={section} />
                    {artwork && <SnapImage artwork={artwork} />}
                  </div>
                )}
                {section.layout === "left-image" && (
                  <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
                    {artwork && <div className="order-2 md:order-1"><SnapImage artwork={artwork} /></div>}
                    <div className="order-1 md:order-2"><SnapCopy section={section} /></div>
                  </div>
                )}
                {section.layout === "split" && (
                  <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-3">
                    {artwork && <SnapImage artwork={artwork} />}
                    <div className="md:col-span-2"><SnapCopy section={section} split /></div>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SnapCopy({
  section,
  split = false,
}: {
  section: (typeof SECTIONS)[number];
  split?: boolean;
}) {
  return (
    <div>
      <h2 className={`${split ? "md:text-[7vw]" : "md:text-[8vw]"} text-[12vw] leading-[0.9] font-[900] tracking-tighter`}>{section.title}</h2>
      <p className="mt-4 text-xl font-bold tracking-tight opacity-80 md:text-2xl">{section.sub}</p>
      <p className="mt-6 max-w-md text-sm opacity-60 md:text-base">{section.desc}</p>
    </div>
  );
}

function SnapImage({ artwork }: { artwork: (typeof displayArtworks)[number] }) {
  return (
    <Link
      href={`/product/${artwork.slug}`}
      data-artwork="true"
      className="relative block aspect-square w-full overflow-hidden rounded-lg"
    >
      <Image
        src={artwork.image}
        alt={artwork.alt}
        fill
        sizes="(min-width: 768px) 46vw, 90vw"
        className="object-cover transition-transform duration-700 hover:scale-[1.03]"
      />
    </Link>
  );
}

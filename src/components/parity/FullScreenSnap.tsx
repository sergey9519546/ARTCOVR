"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { featuredArtworks as displayArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";

const MARQUEE =
  "COVER ART, MADE YOURS • SELECT AN ARTWORK • PROMPT A CHANGE • KEEP ITERATING • PURCHASE AND DOWNLOAD • ";

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
    sub: "",
    desc: "Describe what you want to add, remove, or transform in one freeform prompt.",
    artworkIndex: 4,
    layout: "left-image",
  },
  {
    id: "iterate",
    bg: "bg-[#d7d0c7]",
    fg: "text-black",
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
    layout: "left-image",
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
    <div ref={wrapperRef} id="editorial" tabIndex={-1} className="relative scroll-mt-0 focus:outline-none">
      {/*
        * The bar paints the theme ground, not a fixed cream. `bg-cream` is the
        * same #f3ecd9 as `--foreground` in the dark theme, so the marquee text
        * went cream-on-cream — and because the primary nav is fixed at z-[3]
        * directly over this z-[2] bar, the whole nav went with it for the
        * length of the editorial section.
        */}
      <div
        className={`${staticMode ? "absolute" : "fixed"} top-16 left-0 right-0 z-[2] flex h-12 items-center overflow-hidden border-b border-current/10 bg-background/90 text-foreground backdrop-blur-sm transition-opacity duration-300 ${inView ? "opacity-100" : "pointer-events-none opacity-0"}`}
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
}: {
  section: (typeof SECTIONS)[number];
}) {
  return (
    <div>
      <h2 className="text-[12vw] leading-[0.9] font-[900] tracking-tighter md:text-[8vw]">{section.title}</h2>
      {section.sub && (
        <p className="mt-4 text-xl font-bold tracking-tight opacity-80 md:text-2xl">{section.sub}</p>
      )}
      <p className="mt-6 max-w-md text-sm opacity-60 md:text-base">{section.desc}</p>
    </div>
  );
}

function SnapImage({ artwork }: { artwork: (typeof displayArtworks)[number] }) {
  return (
    <Link
      href={`/product/${artwork.slug}`}
      data-artwork="true"
      className="relative block aspect-square w-full overflow-hidden"
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { displayArtworks } from "@/lib/artcovr/artworks";

const ITEMS = displayArtworks.map((artwork, index) => ({
  id: artwork.id,
  src: artwork.image,
  title: artwork.title,
  slug: artwork.slug,
  alt: artwork.alt,
  bg: index % 2 === 0 ? "bg-[#ece6dc]" : "bg-[#d9d1c8]",
}));
/*
 * The archive cards are sized from the viewport, not from a fixed 300px box:
 * a card fills roughly two thirds of the screen height so a single cover reads
 * as the subject of the section rather than as a thumbnail in a filmstrip.
 */
const CARD_MIN = 320;
const CARD_MAX = 880;
const CARD_VIEWPORT_RATIO = 0.66;
const CARD_GAP_RATIO = 0.06;

function computeCardSize(viewportHeight: number) {
  return Math.round(
    Math.min(Math.max(viewportHeight * CARD_VIEWPORT_RATIO, CARD_MIN), CARD_MAX),
  );
}

const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse)";
const SCROLL_PIXELS_PER_CARD = 170;

export function TiltedCarousel() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [staticMode, setStaticMode] = useState(false);
  const [cardSize, setCardSize] = useState(CARD_MIN);
  const activeIndexRef = useRef(0);
  const scrollTriggerRef = useRef<ReturnType<
    typeof ScrollTrigger.create
  > | null>(null);

  const CW = cardSize;
  const CH = cardSize;
  const CG = Math.round(cardSize * CARD_GAP_RATIO);

  useEffect(() => {
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setStaticMode(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const updateSize = () => setCardSize(computeCardSize(window.innerHeight));
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!sectionRef.current || !trackRef.current) return;

    const section = sectionRef.current;
    const track = trackRef.current;
    if (window.matchMedia(STATIC_MEDIA_QUERY).matches) {
      track.style.transform = "translateX(0px)";
      return;
    }

    try {
      gsap.registerPlugin(ScrollTrigger);
      const trackWidth = ITEMS.length * (CW + CG);
      const maxTravel = Math.max(0, trackWidth - window.innerWidth + CW);

      scrollTriggerRef.current = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${Math.max(6000, ITEMS.length * SCROLL_PIXELS_PER_CARD)}`,
        pin: true,
        scrub: 0.8,
        onUpdate: (self) => {
          try {
            track.style.transform = `translateX(${-self.progress * maxTravel}px)`;
            const center = window.innerWidth / 2;
            const index = Math.round(
              (center + self.progress * maxTravel - CW / 2) / (CW + CG),
            );
            const clampedIndex = Math.max(
              0,
              Math.min(ITEMS.length - 1, index),
            );
            if (clampedIndex !== activeIndexRef.current) {
              activeIndexRef.current = clampedIndex;
              setActiveIndex(clampedIndex);
            }
          } catch (error) {
            console.error("Carousel update error:", error);
          }
        },
        onLeaveBack: () => {
          try {
            activeIndexRef.current = 0;
            setActiveIndex(0);
            track.style.transform = "translateX(0px)";
          } catch (error) {
            console.error("Carousel leaveBack error:", error);
          }
        },
      });
    } catch (error) {
      console.error("Carousel GSAP init failed:", error);
    }

    return () => {
      try {
        scrollTriggerRef.current?.kill();
        scrollTriggerRef.current = null;
      } catch (error) {
        console.error("Carousel cleanup error:", error);
      }
    };
  }, [staticMode, CW, CG]);

  // Preserve the archive's keyboard navigation; static mode scrolls the track
  // horizontally so reduced-motion and touch users are never forced through a pin.
  useEffect(() => {
    if (!sectionRef.current || !trackRef.current) return;
    const section = sectionRef.current;
    const track = trackRef.current;

    const onKey = (event: KeyboardEvent) => {
      if (!section.contains(document.activeElement)) return;
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = Math.max(
        0,
        Math.min(ITEMS.length - 1, activeIndexRef.current + direction),
      );

      if (staticMode) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        track.scrollTo({ left: nextIndex * (CW + CG), behavior: "auto" });
        return;
      }

      const targetY =
        window.scrollY +
        (nextIndex - activeIndexRef.current) * (CW + CG) * 0.8;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    };

    section.addEventListener("keydown", onKey);
    return () => section.removeEventListener("keydown", onKey);
  }, [staticMode, CW, CG]);

  if (ITEMS.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-label="The ARTCOVR archive"
      tabIndex={0}
      className={`relative w-full bg-cream ${
        staticMode
          ? "min-h-screen overflow-hidden py-20"
          : "flex h-screen items-center overflow-hidden"
      }`}
    >
      <div className="absolute top-26 left-4 z-10 text-xs font-bold tracking-tight uppercase lg:left-6">
        <p>The ARTCOVR Archive</p>
      </div>
      <div className="absolute top-26 right-4 z-10 text-xs font-bold tracking-tight tabular-nums uppercase lg:right-6">
        <span>{String(activeIndex + 1).padStart(2, "0")}</span>
        <span className="opacity-40">
          {" "}/ {String(ITEMS.length).padStart(2, "0")}
        </span>
      </div>

      <div
        ref={trackRef}
        className={`flex items-center will-change-transform ${
          staticMode
            ? "mt-16 w-full snap-x snap-mandatory overflow-x-auto"
            : ""
        }`}
        style={{
          gap: `${CG}px`,
          paddingLeft: "50%",
          paddingRight: staticMode ? "50%" : undefined,
          transform: "translateX(0px)",
        }}
        onScroll={
          staticMode
            ? (event) => {
                const nextIndex = Math.max(
                  0,
                  Math.min(
                    ITEMS.length - 1,
                    Math.round(event.currentTarget.scrollLeft / (CW + CG)),
                  ),
                );
                if (nextIndex !== activeIndexRef.current) {
                  activeIndexRef.current = nextIndex;
                  setActiveIndex(nextIndex);
                }
              }
            : undefined
        }
      >
        {ITEMS.map((item) => (
          <Link
            key={item.id}
            className={`carousel-card flex flex-shrink-0 snap-center flex-col items-center gap-3 ${item.bg}`}
            style={{ width: `${CW}px`, height: `${CH}px` }}
            href={`/product/${item.slug}`}
            data-artwork="true"
            aria-label={`Open ${item.title}`}
          >
            <div className="h-full w-full overflow-hidden">
              <img
                src={item.src}
                alt={item.alt}
                className="h-full w-full object-cover"
                loading="lazy"
                width={CW}
                height={CH}
              />
            </div>
          </Link>
        ))}
      </div>

      <div className="absolute bottom-20 left-1/2 z-10 w-[60%] max-w-[600px] -translate-x-1/2">
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-current/20">
          <div
            className="h-full rounded-full bg-current transition-all duration-300"
            style={{
              width: `${ITEMS.length > 1 ? (activeIndex / (ITEMS.length - 1)) * 100 : 100}%`,
            }}
          />
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { featuredArtworks as displayArtworks } from "@/lib/artcovr/artworks";

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
  const convergeRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [staticMode, setStaticMode] = useState(false);
  const [cardSize, setCardSize] = useState(CARD_MIN);
  // Card size follows viewport HEIGHT, but the pin's travel distance and the
  // active-card window are both functions of viewport WIDTH, so width has to be
  // tracked separately or a width-only resize leaves the mapping stale and the
  // last covers unreachable. 0 means "not measured yet" (first client render).
  const [viewportWidth, setViewportWidth] = useState(0);
  const activeIndexRef = useRef(0);
  const scrollTriggerRef = useRef<ReturnType<
    typeof ScrollTrigger.create
  > | null>(null);

  const CW = cardSize;
  const CH = cardSize;
  const CG = Math.round(cardSize * CARD_GAP_RATIO);

  // The pin maps `pinScroll` page pixels onto `maxTravel` px of track
  // translation. Both effects below need that mapping, so it lives here.
  //
  // maxTravel is the translation that centres the LAST card. The track carries
  // `paddingLeft: 50%`, so card i sits at `50vw + i*(CW+CG)` and is centred when
  // the translation reaches `i*(CW+CG) + CW/2`. Deriving it from the track width
  // instead (`trackWidth - viewportWidth + CW`) ignores that padding and stops
  // roughly one card short: at 1920x1080 with 100 cards it ended 204px of the
  // final cover off-screen and the counter could never reach the last index.
  const maxTravel =
    viewportWidth === 0
      ? 0
      : Math.max(0, (ITEMS.length - 1) * (CW + CG) + CW / 2);
  const pinScroll = Math.max(6000, ITEMS.length * SCROLL_PIXELS_PER_CARD);

  useEffect(() => {
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setStaticMode(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useEffect(() => {
    const updateSize = () => {
      setCardSize(computeCardSize(window.innerHeight));
      setViewportWidth(window.innerWidth);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!sectionRef.current || !trackRef.current || viewportWidth === 0) return;

    const section = sectionRef.current;
    const track = trackRef.current;
    const cards = track.querySelectorAll<HTMLElement>(".carousel-card");
    const chrome = section.querySelectorAll<HTMLElement>("[data-chrome]");

    if (window.matchMedia(STATIC_MEDIA_QUERY).matches) {
      track.style.transform = "translateX(0px)";
      // The static track is a real scroll container, so scroll-into-view on
      // focus is the right behaviour there and every card stays tabbable.
      cards.forEach((card) => card.removeAttribute("tabindex"));
      return;
    }

    // Off-screen cards live inside an overflow-hidden, translated track. Left
    // in the tab order, focusing one makes the browser scroll it into view and
    // fight the pin, so only the cards actually on screen stay tabbable.
    const syncFocusWindow = (translate: number) => {
      cards.forEach((card, index) => {
        const left = viewportWidth / 2 + index * (CW + CG) - translate;
        const onScreen = left + CW > 0 && left < viewportWidth;
        const nextTabIndex = onScreen ? 0 : -1;
        if (card.tabIndex !== nextTabIndex) card.tabIndex = nextTabIndex;
      });
    };

    try {
      gsap.registerPlugin(ScrollTrigger);

      scrollTriggerRef.current = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: `+=${pinScroll}`,
        pin: true,
        scrub: 0.8,
        onUpdate: (self) => {
          try {
            const translate = self.progress * maxTravel;
            track.style.transform = `translateX(${-translate}px)`;
            // The track's own paddingLeft is 50%, i.e. the same half-viewport
            // that used to be added here — counting it once put the active
            // index a constant ~1.27 cards ahead, so the counter opened on 02.
            const index = Math.round((translate - CW / 2) / (CW + CG));
            const clampedIndex = Math.max(
              0,
              Math.min(ITEMS.length - 1, index),
            );
            if (clampedIndex !== activeIndexRef.current) {
              activeIndexRef.current = clampedIndex;
              setActiveIndex(clampedIndex);
            }
            syncFocusWindow(translate);

            // Seam blend: chrome fades in as the pinned section settles after
            // the normal grid above it (seam A). The whole row then tips back
            // into the screen and the chrome fades out (seam B), so the next
            // pinned stage — the depth spiral — takes over from a shared
            // ground rather than a hard cut.
            const head = Math.min(1, self.progress / 0.08);
            const tail = Math.max(0, (self.progress - 0.86) / 0.14);
            chrome.forEach((el) => {
              el.style.opacity = String(head * (1 - tail));
            });
            if (convergeRef.current) {
              convergeRef.current.style.transform = `perspective(1200px) rotateX(${-tail * 24}deg) scale(${1 - tail * 0.16})`;
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
            chrome.forEach((el) => {
              el.style.opacity = "1";
            });
            if (convergeRef.current) {
              convergeRef.current.style.transform = "perspective(1200px) rotateX(0deg) scale(1)";
            }
            syncFocusWindow(0);
          } catch (error) {
            console.error("Carousel leaveBack error:", error);
          }
        },
      });

      // Seed from the trigger's real progress, not 0: a reload deep inside the
      // pin starts mid-track, and the window must match what is on screen.
      syncFocusWindow((scrollTriggerRef.current?.progress ?? 0) * maxTravel);
    } catch (error) {
      console.error("Carousel GSAP init failed:", error);
    }

    return () => {
      try {
        scrollTriggerRef.current?.kill();
        scrollTriggerRef.current = null;
        cards.forEach((card) => card.removeAttribute("tabindex"));
        chrome.forEach((el) => {
          el.style.removeProperty("opacity");
        });
        if (convergeRef.current) convergeRef.current.style.removeProperty("transform");
      } catch (error) {
        console.error("Carousel cleanup error:", error);
      }
    };
  }, [staticMode, CW, CG, viewportWidth, maxTravel, pinScroll]);

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
      const currentIndex = activeIndexRef.current;
      const nextIndex = Math.max(
        0,
        Math.min(ITEMS.length - 1, currentIndex + direction),
      );

      if (staticMode) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        track.scrollTo({ left: nextIndex * (CW + CG), behavior: "auto" });
        return;
      }

      if (maxTravel <= 0) return;
      // One press must advance exactly one card, so the page-scroll delta is
      // derived from the pin's own mapping (pinScroll px of scroll == maxTravel
      // px of translation) rather than from a guessed fraction of a card.
      const scrollPerCard = (pinScroll * (CW + CG)) / maxTravel;
      const targetY =
        window.scrollY + (nextIndex - currentIndex) * scrollPerCard;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    };

    section.addEventListener("keydown", onKey);
    return () => section.removeEventListener("keydown", onKey);
  }, [staticMode, CW, CG, maxTravel, pinScroll]);

  if (ITEMS.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-label="The ARTCOVR archive"
      tabIndex={0}
      className={`relative w-full ${
        staticMode
          ? "min-h-screen overflow-hidden py-20"
          : "flex h-screen items-center overflow-hidden"
      }`}
      // Hardcoded cream against the inherited --foreground made the label, the
      // counter and the bg-current progress bar render at 1.00:1 in dark theme,
      // where --foreground is also #f3ecd9. Theme tokens pair correctly in all
      // three themes. (--color-white is #f3ecd9 too, so it is no escape hatch.)
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div data-chrome className="absolute top-26 left-4 z-10 text-xs font-bold tracking-tight uppercase lg:left-6">
        <p>The ARTCOVR Archive</p>
      </div>
      <div data-chrome className="absolute top-26 right-4 z-10 text-xs font-bold tracking-tight tabular-nums uppercase lg:right-6">
        <span>{String(activeIndex + 1).padStart(2, "0")}</span>
        <span className="opacity-40">
          {" "}/ {String(ITEMS.length).padStart(2, "0")}
        </span>
      </div>

      <div
        ref={convergeRef}
        className="absolute inset-0 flex items-center"
        style={{ transform: "perspective(1200px) rotateX(0deg) scale(1)" }}
      >
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
      </div>

      <div data-chrome className="absolute bottom-20 left-1/2 z-10 w-[60%] max-w-[600px] -translate-x-1/2">
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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { featuredArtworks as displayArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import {
  carouselCardSizeForViewport,
  clamp01,
  journeyPhases,
  SHARED_HANDOFF_SWITCH,
  type JourneyStore,
} from "./journey";

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
const CARD_GAP_RATIO = 0.06;

const SCROLL_PIXELS_PER_CARD = 170;

export function TiltedCarousel({ journey }: { journey?: JourneyStore | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const convergeRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [staticMode, setStaticMode] = useState(false);
  const [cardSize, setCardSize] = useState(() =>
    carouselCardSizeForViewport(0),
  );
  // Card size follows viewport HEIGHT, but the pin's travel distance and the
  // active-card window are both functions of viewport WIDTH, so width has to be
  // tracked separately or a width-only resize leaves the mapping stale and the
  // last covers unreachable. 0 means "not measured yet" (first client render).
  const [viewportWidth, setViewportWidth] = useState(0);
  const activeIndexRef = useRef(0);

  const CW = cardSize;
  const CH = cardSize;
  const CG = Math.round(cardSize * CARD_GAP_RATIO);
  const layered = !!journey && !staticMode;

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
  // The scrolls-per-card stays identical in journey coordinates: the carousel
  // phase consumes exactly `pinScroll` master scroll px, so the master scroll
  // per card equals the old per-card formula unchanged.
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
      setCardSize(carouselCardSizeForViewport(window.innerHeight));
      setViewportWidth(window.innerWidth);
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!layered || !journey || !sectionRef.current || viewportWidth === 0) {
      return;
    }

    const section = sectionRef.current;
    const track = trackRef.current;
    const converge = convergeRef.current;
    const chrome = Array.from(
      section.querySelectorAll<HTMLElement>("[data-chrome]"),
    );
    const cards = track
      ? track.querySelectorAll<HTMLElement>(".carousel-card")
      : [];

    // Only the cards actually on screen stay tabbable: off-screen ones live
    // inside an overflow-hidden, translated track, and the browser would fight
    // the transform by scrolling any focused off-screen card into view.
    const syncFocusWindow = (translate: number) => {
      cards.forEach((card, index) => {
        const left = viewportWidth / 2 + index * (CW + CG) - translate;
        const onScreen = left + CW > 0 && left < viewportWidth;
        const nextTabIndex = onScreen ? 0 : -1;
        if (card.tabIndex !== nextTabIndex) card.tabIndex = nextTabIndex;
      });
    };

    const update = (P: number) => {
      const ph = journeyPhases(P, journey.consts);
      const translate = ph.c * maxTravel;

      if (track) track.style.transform = `translateX(${-translate}px)`;

      if (converge) {
        // At carouselEndP the final card is exactly centred. The spiral claims
        // that same image and pose on one deterministic frame; there is no
        // crossfade and therefore no translucent double exposure.
        const spiralOwnsLead = ph.handoff >= SHARED_HANDOFF_SWITCH;
        converge.style.opacity = spiralOwnsLead ? "0" : "1";
        converge.style.visibility = spiralOwnsLead ? "hidden" : "visible";
        converge.style.pointerEvents = spiralOwnsLead ? "none" : "auto";
      }

      // Chrome opens with the journey and steps out through the blend.
      const head = clamp01(P / 0.025);
      const chromeExit = clamp01(
        (SHARED_HANDOFF_SWITCH - ph.handoff) / 0.18,
      );
      const chromeOpacity = head * chromeExit;
      chrome.forEach((el) => {
        el.style.opacity = String(chromeOpacity);
      });

      const index = Math.max(
        0,
        Math.min(ITEMS.length - 1, Math.round((translate - CW / 2) / (CW + CG))),
      );
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
      syncFocusWindow(translate);
    };

    const unregister = journey.register(update);
    // register() already invokes update() with the LIVE master progress above,
    // which seeds both the track transform and the focus window to the current
    // station. The previous manual syncFocusWindow(maxTravel) seed reset the
    // tab-window to the LAST card immediately after, desyncing tabIndex from the
    // real track position (and focus) until the next scroll fired an onUpdate.

    return () => {
      unregister();
      if (track) track.style.transform = "translateX(0px)";
      if (converge) {
        converge.style.transform = "perspective(1200px) rotateX(0deg) scale(1)";
        converge.style.removeProperty("opacity");
        converge.style.removeProperty("visibility");
        converge.style.removeProperty("pointer-events");
      }
      chrome.forEach((el) => el.style.removeProperty("opacity"));
      cards.forEach((card) => card.removeAttribute("tabindex"));
    };
  }, [layered, journey, CW, CG, viewportWidth, maxTravel]);

  // Preserve the archive's keyboard navigation. Static mode scrolls its own
  // track; the layered mode translates the journey's master scroll — the
  // per-card math is identical because the carousel phase spans `pinScroll` px.
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

      if (!layered || maxTravel <= 0) return;
      // One press must advance exactly one card, so the page-scroll delta is
      // derived from the pin's own mapping (pinScroll px of master scroll ==
      // maxTravel px of translation) rather than from a guessed fraction.
      const scrollPerCard = (pinScroll * (CW + CG)) / maxTravel;
      const targetY =
        window.scrollY + (nextIndex - currentIndex) * scrollPerCard;
      // Route through Lenis when it owns the scroll engine so the smooth motion
      // is single-sourced; a native window.scrollTo({behavior:"smooth"}) would
      // fight Lenis' own rAF and lurch.
      const lenis = (
        window as Window & {
          __lenis?: { scrollTo: (t: number, o?: { immediate?: boolean }) => void };
        }
      ).__lenis;
      if (lenis) lenis.scrollTo(targetY);
      else window.scrollTo({ top: targetY, behavior: "smooth" });
    };

    section.addEventListener("keydown", onKey);
    return () => section.removeEventListener("keydown", onKey);
  }, [layered, staticMode, CW, CG, maxTravel, pinScroll]);

  if (ITEMS.length === 0) return null;

  // Reduced-motion / coarse-pointer / non-journey rendering: a real swipeable
  // track that owns its own scroll, and never forces anyone through a pin.
  if (!layered) {
    return (
      <section
        ref={sectionRef}
        aria-label="The ARTCOVR archive"
        tabIndex={0}
        className={`relative w-full ${
          staticMode
            ? "min-h-screen overflow-hidden py-20"
            : "flex min-h-screen items-center overflow-hidden"
        }`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div
          data-chrome
          className="absolute top-26 left-4 z-10 text-xs font-bold tracking-tight uppercase lg:left-6"
        >
          <p>The ARTCOVR Archive</p>
        </div>
        <div
          data-chrome
          className="absolute top-26 right-4 z-10 text-xs font-bold tracking-tight tabular-nums uppercase lg:right-6"
        >
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span className="opacity-40">
            {" "}/ {String(ITEMS.length).padStart(2, "0")}
          </span>
        </div>

        <div
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

        <div
          data-chrome
          className="absolute bottom-20 left-1/2 z-10 w-[60%] max-w-[600px] -translate-x-1/2"
        >
          <div className="h-[2px] w-full overflow-hidden rounded-full bg-current/20">
            <div
              className="h-full rounded-full bg-current"
              style={{
                width: `${ITEMS.length > 1 ? (activeIndex / (ITEMS.length - 1)) * 100 : 100}%`,
              }}
            />
          </div>
        </div>
      </section>
    );
  }

  // Journey rendering: the carousel is one of two absolutely positioned layers
  // inside the single pinned stage; it owns only the horizontal outrun phase,
  // translation driven by the master progress handed to it via `journey`.
  return (
    <section
      ref={sectionRef}
      aria-label="The ARTCOVR archive"
      tabIndex={-1}
      className="absolute inset-0 overflow-hidden"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div
        data-chrome
        className="absolute top-26 left-4 z-10 text-xs font-bold tracking-tight uppercase lg:left-6"
      >
        <p>The ARTCOVR Archive</p>
      </div>
      <div
        data-chrome
        className="absolute top-26 right-4 z-10 text-xs font-bold tracking-tight tabular-nums uppercase lg:right-6"
      >
        <span>{String(activeIndex + 1).padStart(2, "0")}</span>
        <span className="opacity-40">
          {" "}/ {String(ITEMS.length).padStart(2, "0")}
        </span>
      </div>

      <div
        ref={convergeRef}
        data-carousel-converge
        className="absolute inset-0 flex items-center will-change-transform"
        style={{ transform: "perspective(1200px) rotateX(0deg) scale(1)" }}
      >
        <div
          ref={trackRef}
          className="flex items-center will-change-transform"
          style={{ gap: `${CG}px`, paddingLeft: "50%", transform: "translateX(0px)" }}
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

      <div
        data-chrome
        className="absolute bottom-20 left-1/2 z-10 w-[60%] max-w-[600px] -translate-x-1/2"
      >
        <div className="h-[2px] w-full overflow-hidden rounded-full bg-current/20">
          <div
            className="h-full rounded-full bg-current"
            style={{
              width: `${ITEMS.length > 1 ? (activeIndex / (ITEMS.length - 1)) * 100 : 100}%`,
            }}
          />
        </div>
      </div>
    </section>
  );
}

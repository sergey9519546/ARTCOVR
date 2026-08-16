"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { featuredArtworks as displayArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import { journeyPhases, smoothstep, type JourneyStore } from "./journey";

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
const ITEMS = sampleSpiralItems(0);

/*
 * The archive spiral is a depth tunnel, not a stack of absolutely-placed rows.
 * Every cover sits at a fixed angle on an ellipse and at a fixed station along
 * z; scrolling moves the camera down the tunnel, so covers rise out of the far
 * distance, pass the viewer, and leave. Perspective does the scaling, which is
 * what keeps the composition centred at every scroll position — the previous
 * version drove x/y/scale by hand and pushed the whole run off-frame.
 *
 * The tunnel is a funnel, not a straight cylinder: the ellipse radius eases
 * from a wide, flat band at the entrance to the full coil deeper in. The
 * carousel outrun plunges back into that flat band, so the rail the cards
 * travel on never "switches direction" — it merely curves inward as the
 * camera descends. That curvature is the bleed-over the prompt asks for: the
 * horizontal section was the mouth of the spiral all along.
 */
const RADIUS_X = 360;
const RADIUS_Y = 190;
const TURNS = 3.5;
const DEPTH_STEP = 430;
/** Depth window a cover is drawn in, relative to the camera. */
const DEPTH_FAR = -2600;
const DEPTH_NEAR = 420;
/** Depth of the final cover when the scroll ends, so the last frame stays full. */
const DEPTH_END = -1700;
const FADE_IN = 750;
const FADE_OUT = 340;
const PERSPECTIVE = 1400;

const CARD_MIN = 200;
const CARD_MAX = 300;
const CARD_VIEWPORT_RATIO = 0.24;

function computeCardSize(viewportHeight: number) {
  return Math.round(
    Math.min(Math.max(viewportHeight * CARD_VIEWPORT_RATIO, CARD_MIN), CARD_MAX),
  );
}

export function SpiralScroll({ journey }: { journey?: JourneyStore | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const [staticMode, setStaticMode] = useState(false);
  const [cardSize, setCardSize] = useState(CARD_MIN);
  const layered = !!journey && !staticMode;

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
    if (!layered || !journey || ITEMS.length < 2 || !sectionRef.current || !stageRef.current) {
      return;
    }

    const stage = stageRef.current;
    const label = labelRef.current;
    const itemElements = stage.querySelectorAll<HTMLElement>(".spiral-item");
    const chrome = Array.from(
      sectionRef.current!.querySelectorAll<HTMLElement>("[data-chrome]"),
    );

    // Fixed station for every cover: an angle on the ellipse and a depth.
    const angleStep = (TURNS * Math.PI * 2) / Math.max(1, ITEMS.length - 1);
    const positions = ITEMS.map((_, index) => {
      const angle = index * angleStep - Math.PI / 2;
      // Per-station bend: 0 at the mouth (flat, wide band — the continuation of
      // the carousel outrun) easing to 1 deep in the tunnel (full coil).
      const bend = smoothstep(index / Math.max(1, ITEMS.length - 1));
      const radiusX = RADIUS_X * (1.18 - 0.18 * bend);
      const radiusY = RADIUS_Y * (0.28 + 0.72 * bend);
      return {
        x: Math.cos(angle) * radiusX,
        y: Math.sin(angle) * radiusY,
        station: index * DEPTH_STEP,
      };
    });

    // The camera stops while the last covers are still mid-flight rather than
    // travelling past all of them: running to the end of the tunnel empties the
    // frame, so the section would finish on blank ground.
    const travelStart = DEPTH_FAR + FADE_IN;
    const travelEnd = positions[positions.length - 1].station + DEPTH_END;
    const travelRange = travelEnd - travelStart;

    // Depth travel eases in at the mouth so the tunnel never "snatches" the
    // motion the carousel outrun was carrying — the camera drifts through the
    // flat band first, then accelerates down the coil as the outrun gives way.
    const depthEase = (s: number) => s * s * (3 - 2 * s) * 0.35 + s * 0.65;

    const place = (P: number) => {
      const ph = journeyPhases(P, journey.consts);
      const s = ph.s;
      const camera = travelStart + depthEase(s) * travelRange;
      // A residual horizontal drift carried over from the outrun, decaying
      // across the first third of the descent — a literal momentum hand-off so
      // the first spiral cards slide, then settle, then fall into depth.
      const drift = (1 - smoothstep(s / 0.3)) * -cardSize * 0.6;
      const layerOpacity = ph.spiralOpacity;

      itemElements.forEach((element, index) => {
        const position = positions[index];
        const z = camera - position.station;
        const drawn = z > DEPTH_FAR && z < DEPTH_NEAR;

        const fadeIn = Math.min(1, (z - DEPTH_FAR) / FADE_IN);
        const fadeOut = Math.min(1, (DEPTH_NEAR - z) / FADE_OUT);

        element.style.transform = `translate3d(${position.x + drift}px, ${position.y}px, ${drawn ? z : DEPTH_FAR}px) rotateY(${-position.x * 0.045}deg) rotateX(${position.y * 0.02}deg)`;
        element.style.opacity = drawn
          ? String(Math.min(fadeIn, fadeOut) * layerOpacity)
          : "0";

        const visibility = drawn && layerOpacity > 0.001 ? "visible" : "hidden";
        if (element.style.visibility !== visibility) {
          element.style.visibility = visibility;
        }
        const pointer = drawn && layerOpacity > 0.4 ? "auto" : "none";
        if (element.style.pointerEvents !== pointer) {
          element.style.pointerEvents = pointer;
        }
        const tabIndex = drawn && layerOpacity > 0.4 ? 0 : -1;
        if (element.tabIndex !== tabIndex) element.tabIndex = tabIndex;
      });

      // A slow roll of the whole tunnel; deliberately small, so the run never
      // leaves frame the way the old 170-degree stage spin did. It continues the
      // roll the outrun earned as it plunged, so the rotation is one value.
      stage.style.transform = `rotateZ(${-5 + P * 10}deg)`;
      stage.style.opacity = String(layerOpacity);

      if (label) {
        const index = Math.min(ITEMS.length - 1, Math.floor(s * ITEMS.length));
        const itemProgress = (s * ITEMS.length) % 1;
        const opacity =
          itemProgress < 0.15
            ? itemProgress / 0.15
            : itemProgress > 0.85
              ? (1 - itemProgress) / 0.15
              : 1;
        if (label.textContent !== ITEMS[index].title) {
          label.textContent = ITEMS[index].title;
        }
        label.style.opacity = String(opacity * layerOpacity);
      }

      // The spiral's own chrome rises with the layer.
      chrome.forEach((el) => {
        el.style.opacity = String(layerOpacity);
      });
    };

    // Inert until place() decides otherwise, so no frame ships 40 stacked,
    // invisible, clickable covers.
    itemElements.forEach((element) => {
      element.style.visibility = "hidden";
      element.style.pointerEvents = "none";
      element.tabIndex = -1;
      element.style.opacity = "0";
    });
    place(0);

    const unregister = journey.register(place);

    return () => {
      unregister();
      itemElements.forEach((element) => {
        element.style.removeProperty("transform");
        element.style.removeProperty("opacity");
        element.style.removeProperty("visibility");
        element.style.removeProperty("pointer-events");
        element.removeAttribute("tabindex");
      });
      stage.style.removeProperty("transform");
      stage.style.removeProperty("opacity");
      if (label) label.style.removeProperty("opacity");
      chrome.forEach((el) => el.style.removeProperty("opacity"));
    };
  }, [layered, journey, cardSize]);

  if (ITEMS.length === 0) return null;

  if (!layered || ITEMS.length < 2) {
    const staticItems = displayArtworks;
    return (
      <section
        className="px-4 py-20"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
        aria-label="ARTCOVR archive sequence"
      >
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
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        perspective: `${PERSPECTIVE}px`,
      }}
    >
      <div
        data-chrome
        className="absolute top-24 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-3 text-sm font-bold tracking-tight uppercase"
      >
        <span className="border-b border-current pb-0.5">archive</span>
        <span className="opacity-30">•</span>
        <span className="opacity-50">spiral</span>
      </div>
      <div data-chrome className="absolute top-24 right-6 z-[4]">
        <Link
          href="/archive"
          className="flex items-center gap-2 rounded-full border border-current/20 px-4 py-2 text-xs font-bold tracking-tight uppercase transition-colors hover:bg-current/10"
        >
          archive <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </Link>
      </div>
      <div
        data-chrome
        className="absolute bottom-8 left-6 z-10 text-xs font-bold tracking-tight uppercase opacity-40"
      >
        ARTCOVR® • COVER ARCHIVE • 2026
      </div>
      <div
        ref={stageRef}
        className="absolute top-0 left-0 h-full w-full will-change-transform"
        style={{ transformStyle: "preserve-3d", transform: "rotateZ(-5deg)", opacity: 0 }}
      >
        {ITEMS.map((artwork) => (
          <Link
            key={artwork.id}
            href={`/product/${artwork.slug}`}
            data-artwork="true"
            aria-label={`View ${artwork.title}`}
            className="spiral-item absolute top-1/2 left-1/2 will-change-transform"
            style={{
              transformStyle: "preserve-3d",
              width: `${cardSize}px`,
              height: `${cardSize}px`,
              marginTop: `${-cardSize / 2}px`,
              marginLeft: `${-cardSize / 2}px`,
              visibility: "hidden",
              pointerEvents: "none",
              opacity: 0,
            }}
          >
            <span
              className="block h-full w-full overflow-hidden"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "0 30px 60px color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            >
              <img
                src={artwork.image}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                width={cardSize}
                height={cardSize}
              />
            </span>
          </Link>
        ))}
      </div>
      <div
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-32 left-1/2 z-20 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-bold tracking-tight uppercase"
        style={{
          opacity: 0,
          background: "var(--foreground)",
          color: "var(--background)",
        }}
      />
    </section>
  );
}

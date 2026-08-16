"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { featuredArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import { TiltedCarousel } from "./TiltedCarousel";
import { SpiralScroll } from "./SpiralScroll";
import {
  journeyPhases,
  makeJourneyConsts,
  type JourneyConsts,
  type JourneyStore,
} from "./journey";


export function ScrollJourney({ enabled }: { enabled: boolean }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<ReturnType<typeof ScrollTrigger.create> | null>(
    null,
  );
  const updatersRef = useRef<Set<(progress: number) => void>>(new Set());
  const currentPRef = useRef(0);
  const [staticMode, setStaticMode] = useState(false);
  const [debug, setDebug] = useState(false);
  const [consts] = useState<JourneyConsts>(() =>
    makeJourneyConsts(featuredArtworks.length),
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setStaticMode(mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  // Dev-only instrumentation: open the journey under ?journey-debug to see the
  // master progress, phase values and the blend window on the live composition.
  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(window.location.search);
    setDebug(params.has("journey-debug"));
  }, [enabled]);

  // A stable store: register just adds to the updater set and seeds the LIVE
  // progress so a re-mounting or re-measuring child snaps to the current state
  // instead of frame zero — no lurch when a resize effect re-subscribes.
  const journey = useMemo<JourneyStore>(
    () => ({
      consts,
      register: (updater) => {
        updatersRef.current.add(updater);
        updater(currentPRef.current);
        return () => {
          updatersRef.current.delete(updater);
        };
      },
    }),
    [consts],
  );

  useEffect(() => {
    if (!enabled || staticMode || !rootRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;

    triggerRef.current = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: `+=${consts.total}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const P = self.progress;
        currentPRef.current = P;
        // Transform writes on inert layers are cheaper than a state update, and
        // a throw inside one layer never stalls the rail for the others.
        updatersRef.current.forEach((updater) => {
          try {
            updater(P);
          } catch {
            /* the ErrorBoundary keeps the page inert, never failing the rail */
          }
        });
      },
      onLeaveBack: () => {
        currentPRef.current = 0;
        updatersRef.current.forEach((updater) => {
          try {
            updater(0);
          } catch {
            /* ignore */
          }
        });
      },
    });

    return () => {
      triggerRef.current?.kill();
      triggerRef.current = null;
    };
  }, [enabled, staticMode, consts.total]);

  if (staticMode) {
    // Reduced-motion and coarse-pointer users get the document-flow shells:
    // a swipeable snap track and a static grid. No pinned stage, no master
    // timeline — the layers are nothing special here.
    return (
      <>
        <TiltedCarousel />
        <SpiralScroll />
      </>
    );
  }

  return (
    <section
      ref={rootRef}
      aria-label="ARTCOVR archive journey"
      className="relative h-screen w-full overflow-hidden"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        perspective: "1400px",
      }}
    >
      <TiltedCarousel journey={journey} />
      <SpiralScroll journey={journey} />
      {debug ? <JourneyDebugHUD journey={journey} consts={consts} /> : null}
    </section>
  );
}

/*
 * Dev instrumentation only. Subscribes through the same register() the layers
 * use, so the numbers on the HUD are exactly the values driving the cards —
 * the moment they stop jumping at a hand-off, the hand-off is continuous.
 */
function JourneyDebugHUD({
  journey,
  consts,
}: {
  journey: JourneyStore;
  consts: JourneyConsts;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const render = (P: number) => {
      const panel = panelRef.current;
      if (!panel) return;
      const ph = journeyPhases(P, consts);
      const line =
        `P ${P.toFixed(3)}  ·  c ${ph.c.toFixed(3)}  s ${ph.s.toFixed(3)}` +
        `  ·  carO ${ph.carouselOpacity.toFixed(3)}  spO ${ph.spiralOpacity.toFixed(3)}` +
        `  plunge ${ph.carouselPlunge.toFixed(3)}\n` +
        `fade ${consts.fadeStartP.toFixed(3)} → ${consts.fadeEndP.toFixed(3)}` +
        `  ·  carouselEnd ${consts.carouselEndP.toFixed(3)}` +
        `  ·  total ${Math.round(consts.total)}px`;
      panel.textContent = line;
    };
    return journey.register(render);
  }, [journey, consts]);

  return (
    <div
      ref={panelRef}
      aria-hidden="true"
      className="pointer-events-none fixed bottom-2 left-2 z-[30] whitespace-pre-line rounded bg-black/80 p-2 font-mono text-[10px] leading-tight text-white"
      style={{ tabSize: 2 }}
    />
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { featuredArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import { TiltedCarousel } from "./TiltedCarousel";
import { SpiralScroll } from "./SpiralScroll";
import {
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
        updatersRef.current.forEach((updater) => {
          try {
            updater(P);
          } catch {
            /* ignore */
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
    </section>
  );
}

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

const JOURNEY_STATIC_MEDIA_QUERY = `${STATIC_MEDIA_QUERY}, (max-width: 767px)`;

export function ScrollJourney({ enabled }: { enabled: boolean }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<ReturnType<typeof ScrollTrigger.create> | null>(
    null,
  );
  const updatersRef = useRef<Set<(progress: number) => void>>(new Set());
  const currentPRef = useRef(0);
  const [staticMode, setStaticMode] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia(JOURNEY_STATIC_MEDIA_QUERY).matches
  );
  const [motionFailed, setMotionFailed] = useState(false);
  const [consts] = useState<JourneyConsts>(() =>
    makeJourneyConsts(featuredArtworks.length),
  );
  useEffect(() => {
    const mediaQuery = window.matchMedia(JOURNEY_STATIC_MEDIA_QUERY);
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
  const layered = !staticMode && !motionFailed;

  useLayoutEffect(() => {
    if (!enabled || !layered || !rootRef.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;
    let disposed = false;

    triggerRef.current = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: `+=${consts.total}`,
      pin: true,
      scrub: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (disposed) return;
        const P = self.progress;
        currentPRef.current = P;
        for (const updater of updatersRef.current) {
          if (disposed) return;
          try {
            updater(P);
          } catch (error) {
            console.error("ARTCOVR archive journey entered its static fallback", error);
            setMotionFailed(true);
            break;
          }
        }
      },
      onLeaveBack: () => {
        if (disposed) return;
        currentPRef.current = 0;
        for (const updater of updatersRef.current) {
          if (disposed) return;
          try {
            updater(0);
          } catch (error) {
            console.error("ARTCOVR archive journey entered its static fallback", error);
            setMotionFailed(true);
            break;
          }
        }
      },
    });

    return () => {
      // ScrollTrigger's pin wraps and moves the section in the DOM. A layout
      // effect cleanup runs before React removes that subtree, giving GSAP time
      // to restore the original structure while every node is still attached.
      disposed = true;
      const trigger = triggerRef.current;
      triggerRef.current = null;
      trigger?.kill(true);
    };
  }, [enabled, layered, consts.total]);

  if (featuredArtworks.length < 2) return null;

  return (
    <section
      ref={rootRef}
      aria-label={layered ? "ARTCOVR archive journey" : undefined}
      className={layered ? "relative h-screen w-full overflow-hidden" : "contents"}
      style={
        layered
          ? {
              background: "var(--background)",
              color: "var(--foreground)",
              perspective: "1400px",
            }
          : undefined
      }
    >
      {layered ? (
        <>
          <TiltedCarousel journey={journey} />
          <SpiralScroll journey={journey} />
        </>
      ) : (
        <>
          <TiltedCarousel />
          <SpiralScroll />
        </>
      )}
    </section>
  );
}

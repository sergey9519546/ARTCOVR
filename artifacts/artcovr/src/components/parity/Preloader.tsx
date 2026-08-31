"use client";

import { useEffect, useRef, useState } from "react";
import { featuredArtworks as displayArtworks, pickIntroArtworks } from "@/lib/artcovr/artworks";
import {
  PRELOADER_COMPLETE_TIME_MS,
  REDUCED_MOTION_QUERY,
} from "@/lib/artcovr/motion";

const PRELOADER_IMAGES = pickIntroArtworks(displayArtworks, 18);
const ROTATIONS = [
  9.98, -12.43, -2.99, -6.51, 17.67, -1.09,
  12.35, -8.74, 5.12, -14.82, 11.23, -4.67,
  15.41, -11.08, 3.89, -7.95, 13.72, -9.45,
];
// The counter is paced as a slow crawl that accelerates into a ramp: it dwells
// in the low single digits for a long time (the "really slow start"), then the
// gaps between steps shrink and the increments grow as it ramps toward 100.
const COUNTER_STEPS = [
  { d: 1100, v: 1 }, { d: 1600, v: 2 }, { d: 2050, v: 4 },
  { d: 2450, v: 9 }, { d: 2800, v: 16 }, { d: 3100, v: 29 },
  { d: 3350, v: 52 }, { d: 3550, v: 76 }, { d: 3700, v: 92 },
  { d: 3780, v: 100 },
];
const IMAGE_START = 840;
const IMAGE_INTERVAL = 168;
const EXIT_TIME = 4060;
const DISMISS_TIME = 5180;

export function Preloader({ onComplete }: { onComplete?: () => void }) {
  const [visibleImages, setVisibleImages] = useState(0);
  const [counter, setCounter] = useState(0);
  const [exited, setExited] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    document.documentElement.classList.add("ready");
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;

    if (reducedMotion) {
      setVisibleImages(PRELOADER_IMAGES.length);
      setCounter(100);
      setExited(true);
      setDismissed(true);
      onCompleteRef.current?.();
      return;
    }

    const safetyTimer = setTimeout(() => {
      setVisibleImages(PRELOADER_IMAGES.length);
      setCounter(100);
    }, 8000);
    const timers: ReturnType<typeof setTimeout>[] = COUNTER_STEPS.map((step) =>
      setTimeout(() => setCounter(step.v), step.d),
    );
    for (let index = 0; index < PRELOADER_IMAGES.length; index += 1) {
      timers.push(setTimeout(() => setVisibleImages(index + 1), IMAGE_START + index * IMAGE_INTERVAL));
    }
    timers.push(setTimeout(() => setExited(true), EXIT_TIME));
    timers.push(setTimeout(() => onCompleteRef.current?.(), PRELOADER_COMPLETE_TIME_MS));
    timers.push(setTimeout(() => setDismissed(true), DISMISS_TIME));

    // Keyboard users must never be locked out of the page by the intro:
    // any key press (Tab toward the skip link, Enter, Escape) dismisses the
    // preloader immediately so the inert main content becomes reachable.
    const skipIntro = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Tab" && e.key !== "Enter") return;
      clearTimeout(safetyTimer);
      timers.forEach((timer) => clearTimeout(timer));
      setVisibleImages(PRELOADER_IMAGES.length);
      setCounter(100);
      setExited(true);
      setDismissed(true);
      onCompleteRef.current?.();
      window.removeEventListener("keydown", skipIntro);
    };
    window.addEventListener("keydown", skipIntro);

    return () => {
      clearTimeout(safetyTimer);
      timers.forEach((timer) => clearTimeout(timer));
      window.removeEventListener("keydown", skipIntro);
    };
  }, []);

  if (dismissed) return null;

  return (
    <>
      <div
        id="artcovr-preloader"
        className="fixed inset-0 z-50 flex items-center justify-center gap-8"
      style={{
        // Light is the primary theme, so the intro takes the theme background
        // (cream) rather than a hardcoded black. The wordmark and counter stay
        // a constant cream under mix-blend-difference, which resolves to black
        // on the cream ground and to cream on the dark-theme ground.
        background: "var(--background)",
        color: "var(--foreground)",
        clipPath: exited ? "inset(0% 0% 100% 0%)" : "inset(0% 0% 0% 0%)",
        transition: "clip-path 0.7s cubic-bezier(0.19,1,0.22,1)",
        contain: "layout style paint",
      }}
      role={exited ? undefined : "status"}
      aria-hidden={exited}
      aria-live={exited ? undefined : "polite"}
      aria-label={exited ? undefined : `Loading ${counter} percent`}
    >
      <div className="relative">
        {/*
         * The archive intro stacks every cover on the exact same centre point,
         * each one rotated and punched in from scale 0. The cards must not be
         * fanned apart across the viewport: the overlap is the effect.
         *
         * On exit the stack does NOT hold as a final cover lockup: every card
         * collapses back to scale 0 (scales down out of the way) while the
         * curtain wipes up, so the held frame is the real hero behind, not a
         * blue cover. The build punch-in is untouched — only `exited` reads
         * here, and it stays false until the counter reaches 100.
         */}
        <div className="fixed inset-0 flex items-center justify-center" style={{ contain: "layout paint style" }}>
          {PRELOADER_IMAGES.map((artwork, index) => {
            const visible = index < visibleImages;
            const shown = visible && !exited;
            return (
              <img
                key={artwork.id}
                src={artwork.image}
                alt=""
                loading="eager"
                width={450}
                height={450}
                decoding="async"
                className="absolute aspect-square w-[42vw] object-cover sm:w-[32vw] md:w-[20vw]"
                style={{
                  color: "transparent",
                  willChange: "transform",
                  transform: `translate3d(0,0,0) rotate(${ROTATIONS[index % ROTATIONS.length]}deg) scale(${shown ? 1 : 0})`,
                  transition: "transform 0.5s cubic-bezier(0.19,1,0.22,1)",
                  zIndex: index + 1,
                }}
                sizes="(max-width: 640px) 42vw, (max-width: 768px) 32vw, 20vw"
              />
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="artcovr-wordmark text-cream relative mx-auto w-fit max-w-[88vw] overflow-visible text-center text-[clamp(2.8rem,9vw,8.5rem)] mix-blend-difference"
          style={{
            zIndex: 50,
            opacity: exited ? 0 : 1,
            transition: "opacity 0.4s cubic-bezier(0.19,1,0.22,1)",
          }}
        >
          ARTCOVR
        </div>
        <div className="absolute -top-10 right-0 overflow-hidden text-2xl mix-blend-difference">
          <span className="text-cream block text-right">{String(counter).padStart(3, "0")}</span>
        </div>
      </div>
      <div
        className="absolute right-0 bottom-0 left-0 h-[3px]"
        style={{ background: "color-mix(in srgb, var(--foreground) 12%, transparent)" }}
      >
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{ width: `${counter}%`, background: "var(--foreground)" }}
        />
      </div>
    </div>
  </>
  );
}

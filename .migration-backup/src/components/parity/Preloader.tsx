"use client";

import { useEffect, useRef, useState } from "react";
import { featuredArtworks as displayArtworks, pickIntroArtworks } from "@/lib/artcovr/artworks";
import {
  PRELOADER_COMPLETE_TIME_MS,
  PRELOADER_FAILSAFE_TIME_MS,
  STATIC_MEDIA_QUERY,
} from "@/lib/artcovr/motion";

const PRELOADER_IMAGES = pickIntroArtworks(displayArtworks, 6);
const ROTATIONS = [
  9.98, -12.43, -2.99, -6.51, 17.67, -1.09,
  12.35, -8.74, 5.12, -14.82, 11.23, -4.67,
  15.41, -11.08, 3.89, -7.95, 13.72, -9.45,
];
// Keep a brief editorial beat, then accelerate. The intro must never become a
// multi-second acquisition tax before visitors can browse or buy.
const COUNTER_STEPS = [
  { d: 180, v: 2 }, { d: 360, v: 7 }, { d: 560, v: 16 },
  { d: 780, v: 31 }, { d: 1010, v: 53 }, { d: 1220, v: 76 },
  { d: 1400, v: 92 }, { d: 1500, v: 100 },
];
const IMAGE_START = 180;
const IMAGE_INTERVAL = 220;
const EXIT_TIME = 1600;
const DISMISS_TIME = 2350;

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
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let completionNotified = false;

    const clearScheduledWork = () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      timers.forEach((timer) => clearTimeout(timer));
    };
    const notifyComplete = () => {
      if (completionNotified) return;
      completionNotified = true;
      onCompleteRef.current?.();
    };
    const dismissIntro = () => {
      clearScheduledWork();
      setVisibleImages(PRELOADER_IMAGES.length);
      setCounter(100);
      setExited(true);
      setDismissed(true);
      notifyComplete();
    };

    if (mediaQuery.matches) {
      dismissIntro();
      return;
    }

    safetyTimer = setTimeout(dismissIntro, PRELOADER_FAILSAFE_TIME_MS);
    timers.push(...COUNTER_STEPS.map((step) =>
      setTimeout(() => setCounter(step.v), step.d),
    ));
    for (let index = 0; index < PRELOADER_IMAGES.length; index += 1) {
      timers.push(setTimeout(() => setVisibleImages(index + 1), IMAGE_START + index * IMAGE_INTERVAL));
    }
    timers.push(setTimeout(() => setExited(true), EXIT_TIME));
    timers.push(setTimeout(notifyComplete, PRELOADER_COMPLETE_TIME_MS));
    timers.push(setTimeout(() => setDismissed(true), DISMISS_TIME));

    // Keyboard users must never be locked out of the page by the intro:
    // any key press (Tab toward the skip link, Enter, Escape) dismisses the
    // preloader immediately so the inert main content becomes reachable.
    const skipIntro = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Tab" && e.key !== "Enter") return;
      dismissIntro();
      window.removeEventListener("keydown", skipIntro);
    };
    const enterStaticMode = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      dismissIntro();
      window.removeEventListener("keydown", skipIntro);
      mediaQuery.removeEventListener("change", enterStaticMode);
    };
    window.addEventListener("keydown", skipIntro);
    mediaQuery.addEventListener("change", enterStaticMode);

    return () => {
      clearScheduledWork();
      window.removeEventListener("keydown", skipIntro);
      mediaQuery.removeEventListener("change", enterStaticMode);
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
        pointerEvents: exited ? "none" : undefined,
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
          {PRELOADER_IMAGES.slice(0, visibleImages).map((artwork, index) => {
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

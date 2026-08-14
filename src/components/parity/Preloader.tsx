"use client";

import { useEffect, useRef, useState } from "react";
import { displayArtworks, pickIntroArtworks } from "@/lib/artcovr/artworks";

const PRELOADER_IMAGES = pickIntroArtworks(displayArtworks, 6);
const ROTATIONS = [9.98, -12.43, -2.99, -6.51, 17.67, -1.09];
const COUNTER_STEPS = [
  { d: 800, v: 1 }, { d: 1100, v: 4 }, { d: 1300, v: 9 },
  { d: 1500, v: 16 }, { d: 1700, v: 29 }, { d: 1900, v: 76 },
  { d: 2100, v: 86 }, { d: 2300, v: 94 }, { d: 2500, v: 98 },
  { d: 2700, v: 100 },
];
const IMAGE_START = 600;
const IMAGE_INTERVAL = 120;
const EXIT_TIME = 2900;
const COMPLETE_TIME = 3500;
const DISMISS_TIME = 3700;

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
    const staticExperience = window.matchMedia(
      "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)",
    ).matches;

    if (staticExperience) {
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
    timers.push(setTimeout(() => onCompleteRef.current?.(), COMPLETE_TIME));
    timers.push(setTimeout(() => setDismissed(true), DISMISS_TIME));

    return () => {
      clearTimeout(safetyTimer);
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  if (dismissed) return null;

  return (
    <div
      id="artcovr-preloader"
      className="fixed inset-0 z-50 flex items-center justify-center gap-8 bg-black text-white dark:bg-[#f4f0ea] dark:text-black"
      style={{
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
        <div className="fixed inset-0 flex items-center justify-center" style={{ contain: "layout paint style" }}>
          {PRELOADER_IMAGES.map((artwork, index) => {
            const visible = index < visibleImages;
            const imageScale = visible ? 1 : 0.68;
            const offsetX = index % 2 === 0 ? 0 : 18;
            const offsetY = index * 5;
            return (
              <img
                key={artwork.id}
                src={artwork.image}
                alt=""
                loading="eager"
                width={520}
                height={520}
                decoding="async"
                className="absolute aspect-square w-[60vw] object-cover sm:w-[38vw] md:w-[24vw] lg:w-[20vw]"
                style={{
                  color: "transparent",
                  willChange: "transform",
                  transform: `translate3d(${offsetX}px, ${offsetY}px, 0) rotate(${ROTATIONS[index]}deg) scale(${imageScale})`,
                  transition: "transform 0.55s cubic-bezier(0.19,1,0.22,1), opacity 0.55s ease",
                  zIndex: index + 1,
                  opacity: visible ? 1 : 0.2,
                  filter: visible ? "saturate(1.04) contrast(1.02)" : "saturate(0.85) contrast(0.95)",
                }}
                sizes="(max-width: 768px) 60vw, (max-width: 1024px) 38vw, 20vw"
              />
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="relative mx-auto w-[28rem] max-w-[70vw] overflow-visible text-center text-[clamp(3.2rem,8vw,7.5rem)] font-black leading-none tracking-[-0.09em] text-white mix-blend-difference dark:text-black md:max-w-none"
          style={{ zIndex: 20 }}
        >
          ARTCOVR
        </div>
        <div className="absolute -top-10 right-0 overflow-hidden text-2xl">
          <span className="block text-right text-white dark:text-black">{String(counter).padStart(3, "0")}</span>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 left-0 h-[3px] bg-white/10 dark:bg-black/10">
        <div className="h-full bg-white transition-all duration-300 ease-out dark:bg-black" style={{ width: `${counter}%` }} />
      </div>
    </div>
  );
}

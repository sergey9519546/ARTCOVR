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
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white"
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
      <div className="absolute inset-0 isolate">
        {PRELOADER_IMAGES.map((artwork, index) => {
          const visible = index < visibleImages;
          const imageScale = visible ? 1 : 0.72;
          const centerShiftX = (index - (PRELOADER_IMAGES.length - 1) / 2) * 26;
          const centerShiftY = (index % 2 === 0 ? -18 : 18) + index * 10;
          return (
            <img
              key={artwork.id}
              src={artwork.image}
              alt=""
              loading="eager"
              width={540}
              height={540}
              decoding="async"
              className="absolute left-1/2 top-1/2 aspect-square w-[58vw] object-cover sm:w-[36vw] md:w-[22vw] lg:w-[18vw]"
              style={{
                color: "transparent",
                willChange: "transform",
                transform: `translate3d(calc(-50% + ${centerShiftX}px), calc(-50% + ${centerShiftY}px), 0) rotate(${ROTATIONS[index]}deg) scale(${imageScale})`,
                transition: "transform 0.55s cubic-bezier(0.19,1,0.22,1), opacity 0.55s ease",
                zIndex: index + 1,
                opacity: visible ? 1 : 0.18,
                filter: visible ? "saturate(1.04) contrast(1.02)" : "saturate(0.8) contrast(0.92)",
              }}
              sizes="(max-width: 768px) 58vw, (max-width: 1024px) 36vw, 18vw"
            />
          );
        })}
      </div>

      <div className="relative z-20 flex h-full items-center justify-center">
        <div
          aria-hidden="true"
          className="text-center text-[clamp(3.7rem,8vw,10rem)] font-black leading-[0.78] tracking-[-0.09em] text-white"
          style={{ mixBlendMode: "difference" }}
        >
          ARTCOVR
        </div>
      </div>

      <div className="absolute right-8 top-8 z-30 text-[0.7rem] font-bold uppercase tracking-[0.24em] text-white" style={{ mixBlendMode: "difference" }}>
        {String(counter).padStart(3, "0")}
      </div>

      <div className="absolute right-0 bottom-0 left-0 z-30 h-[3px] bg-white/10">
        <div className="h-full bg-white transition-all duration-300 ease-out" style={{ width: `${counter}%` }} />
      </div>
    </div>
  );
}

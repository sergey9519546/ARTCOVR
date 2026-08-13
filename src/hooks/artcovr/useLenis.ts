"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse)";

export function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled || window.matchMedia(STATIC_MEDIA_QUERY).matches) return;

    let animationFrame = 0;
    let refreshTimer = 0;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (time: number) =>
        Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
    });

    document.documentElement.classList.add("lenis");
    (window as Window & { __lenis?: Lenis }).__lenis = lenis;
    gsap.registerPlugin(ScrollTrigger);
    lenis.on("scroll", ScrollTrigger.update);
    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 100);

    const render = (time: number) => {
      lenis.raf(time);
      animationFrame = window.requestAnimationFrame(render);
    };
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.clearTimeout(refreshTimer);
      window.cancelAnimationFrame(animationFrame);
      lenis.off("scroll", ScrollTrigger.update);
      lenis.destroy();
      delete (window as Window & { __lenis?: Lenis }).__lenis;
      document.documentElement.classList.remove("lenis");
    };
  }, [enabled]);
}

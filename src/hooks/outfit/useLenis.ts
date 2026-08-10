"use client";
import { useEffect } from "react";
import Lenis from "lenis";
export function useLenis(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window && navigator.maxTouchPoints > 0;
    if (isTouch) return;
    const lenis = new Lenis({ duration: 1.2, easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    document.documentElement.classList.add("lenis", "lenis-smooth");
    (window as any).__lenis = lenis;
    let rafId = 0;
    function raf(time: number) { lenis.raf(time); rafId = requestAnimationFrame(raf); }
    rafId = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(rafId); lenis.destroy(); delete (window as any).__lenis; document.documentElement.classList.remove("lenis", "lenis-smooth"); };
  }, [enabled]);
}

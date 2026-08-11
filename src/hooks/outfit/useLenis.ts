"use client";
import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function useLenis(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    let lenis: any = null;
    let rafId = 0;

    // Skip on touch devices
    try {
      const isTouch = window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window && navigator.maxTouchPoints > 0;
      if (isTouch) return;
    } catch (e) {
      console.error("Lenis touch check failed:", e);
      return;
    }

    try {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      document.documentElement.classList.add("lenis");
      (window as any).__lenis = lenis;

      // Connect Lenis scroll to GSAP ScrollTrigger
      gsap.registerPlugin(ScrollTrigger);
      lenis.on("scroll", ScrollTrigger.update);

      // Refresh ScrollTrigger after a brief delay to ensure all components have mounted
      setTimeout(() => ScrollTrigger.refresh(), 100);

      const raf = (time: number) => {
        try {
          if (lenis) lenis.raf(time);
          rafId = requestAnimationFrame(raf);
        } catch (e) {
          console.error("Lenis raf error:", e);
          cancelAnimationFrame(rafId);
        }
      };
      rafId = requestAnimationFrame(raf);
    } catch (e) {
      console.error("Lenis init failed:", e);
    }

    return () => {
      try {
        if (rafId) cancelAnimationFrame(rafId);
        if (lenis) lenis.destroy();
        delete (window as any).__lenis;
        document.documentElement.classList.remove("lenis");
      } catch (e) {
        console.error("Lenis cleanup error:", e);
      }
    };
  }, [enabled]);
}

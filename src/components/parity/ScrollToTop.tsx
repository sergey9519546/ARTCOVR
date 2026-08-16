"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    // Route through Lenis when it owns the scroll engine: a bare window.scrollTo
    // bypasses Lenis' rAF and can leave the smooth layer fighting the jump (and
    // ScrollTrigger reading stale scroll until Lenis re-syncs).
    const lenis = (
      window as Window & {
        __lenis?: { scrollTo: (t: number, o?: { immediate?: boolean }) => void };
      }
    ).__lenis;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

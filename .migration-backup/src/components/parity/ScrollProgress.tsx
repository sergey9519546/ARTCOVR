"use client";
import { useEffect, useRef } from "react";
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let rafId = 0;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? h.scrollTop / max : 0;
      if (ref.current) ref.current.style.transform = `scaleX(${p})`;
      rafId = 0;
    };
    const onScroll = () => { if (rafId === 0) rafId = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (rafId) cancelAnimationFrame(rafId); };
  }, []);
  return (<div className="fixed top-0 left-0 right-0 z-[4] h-[2px] bg-current/10 pointer-events-none" aria-hidden="true"><div ref={ref} className="h-full bg-current origin-left will-change-transform" style={{ transform: "scaleX(0)" }} /></div>);
}

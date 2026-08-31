"use client";
import { useEffect, useRef, useState } from "react";
export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const isTouch = window.matchMedia("(pointer: coarse)").matches && "ontouchstart" in window && navigator.maxTouchPoints > 0;
    if (isTouch) return;
    setEnabled(true);
    document.documentElement.classList.add("has-custom-cursor");
    return () => document.documentElement.classList.remove("has-custom-cursor");
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const cursor = cursorRef.current;
    if (!cursor) return;
    let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, rafId = 0, first = true;
    const tick = () => {
      cx += (mx - cx) * 0.22;
      cy += (my - cy) * 0.22;
      cursor.style.transform = `translate3d(${cx}px,${cy}px,0)`;
      if (Math.abs(mx - cx) > .1 || Math.abs(my - cy) > .1) rafId = requestAnimationFrame(tick);
      else rafId = 0;
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (first) { first = false; cx = mx; cy = my; setVisible(true); }
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onLeave = () => { setVisible(false); if (rafId) cancelAnimationFrame(rafId); rafId = 0; };
    const onEnter = () => setVisible(true);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => { cancelAnimationFrame(rafId); window.removeEventListener("mousemove", onMove); document.removeEventListener("mouseleave", onLeave); document.removeEventListener("mouseenter", onEnter); };
  }, [enabled]);
  if (!enabled) return null;
  return (<div ref={cursorRef} className="pointer-events-none fixed top-0 left-0 z-[9999] will-change-transform" style={{ opacity: visible ? 1 : 0 }} aria-hidden="true"><div><div className="-mt-1 -ml-1 h-2 w-2 rounded-full bg-[var(--cursor-color)]" /></div></div>);
}

"use client";

import { useEffect, useState } from "react";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";

export function PageTransition({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const [phase, setPhase] = useState<"idle" | "holding" | "exiting" | "done">("idle");
  useEffect(() => {
    if (!active) {
      setPhase("idle");
      return;
    }
    if (window.matchMedia(STATIC_MEDIA_QUERY).matches) {
      setPhase("done");
      onComplete?.();
      return;
    }
    setPhase("holding");
    const exitTimer = setTimeout(() => setPhase("exiting"), 700);
    const doneTimer = setTimeout(() => {
      setPhase("done");
      onComplete?.();
    }, 1500);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [active, onComplete]);
  if (phase === "idle" || phase === "done") return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] bg-black dark:bg-cream"
      style={{
        clipPath: phase === "exiting" ? "inset(100% 0% 0% 0%)" : "inset(0% 0% 0% 0%)",
        transition: phase === "exiting" ? "clip-path 0.7s cubic-bezier(0.19,1,0.22,1)" : "none",
      }}
      aria-hidden="true"
    />
  );
}

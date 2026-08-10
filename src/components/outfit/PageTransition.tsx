"use client";
import { useEffect, useState } from "react";
import { OutfitWordmark } from "./Svgs";
export function PageTransition({ active, onComplete }: { active: boolean; onComplete?: () => void }) {
  const [phase, setPhase] = useState<"idle"|"holding"|"exiting"|"done">("idle");
  useEffect(() => { if (!active) { setPhase("idle"); return; } setPhase("holding"); const e = setTimeout(() => setPhase("exiting"), 700); const d = setTimeout(() => { setPhase("done"); onComplete?.(); }, 1500); return () => { clearTimeout(e); clearTimeout(d); }; }, [active, onComplete]);
  if (phase === "idle" || phase === "done") return null;
  return (<div className="fixed inset-0 z-[100] flex items-center justify-center bg-red text-cream pointer-events-none" style={{ clipPath: phase==="exiting"?"inset(100% 0% 0% 0%)":"inset(0% 0% 0% 0%)", transition: phase==="exiting"?"clip-path 0.7s cubic-bezier(0.19,1,0.22,1)":"none" }} aria-hidden="true"><div className="w-[50vw] md:w-[35vw] transition-opacity duration-300" style={{ opacity: phase==="holding"||phase==="exiting"?1:0 }}><OutfitWordmark /></div></div>);
}

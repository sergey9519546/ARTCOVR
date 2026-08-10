"use client";
import { useEffect, useRef } from "react";

// 26 images: 13 product fronts + 13 product backs (doubled from original 13)
const ITEMS = [
  "/assets/products/off-by-design-front.jpg",
  "/assets/products/kerned-confidence-front.jpg",
  "/assets/products/specimen-no-hh01-front.jpg",
  "/assets/products/grid-system-go-front.jpg",
  "/assets/products/neutral-grotesk-front.jpg",
  "/assets/products/red-dot-not-award-front.jpg",
  "/assets/products/gridlocked-front.jpg",
  "/assets/products/hello-week-001-front.jpg",
  "/assets/products/hello-week-002-front.jpg",
  "/assets/products/monochrome-manifest-front.jpg",
  "/assets/products/positive-space-front.jpg",
  "/assets/products/whitespace-matters-front.jpg",
  "/assets/products/command-k-front.jpg",
  "/assets/products/off-by-design-back.jpg",
  "/assets/products/kerned-confidence-back.jpg",
  "/assets/products/specimen-no-hh01-back.jpg",
  "/assets/products/grid-system-go-back.jpg",
  "/assets/products/neutral-grotesk-back.jpg",
  "/assets/products/red-dot-not-award-back.jpg",
  "/assets/products/gridlocked-back.jpg",
  "/assets/products/hello-week-001-back.jpg",
  "/assets/products/hello-week-002-back.jpg",
  "/assets/products/monochrome-manifest-back.jpg",
  "/assets/products/positive-space-back.jpg",
  "/assets/products/whitespace-matters-back.jpg",
  "/assets/products/command-k-back.jpg"
];
const TITLES = [
  "Off by Design", "Kerned Confidence", "Specimen No. HH01", "Grid System Go", "Neutral Grotesk",
  "Red Dot Not Award", "Gridlocked", "Hello Week 001", "Hello Week 002", "Monochrome Manifest",
  "Positive Space", "Whitespace Matters", "Command + K",
  "Off by Design (Back)", "Kerned Confidence (Back)", "Specimen No. HH01 (Back)", "Grid System Go (Back)",
  "Neutral Grotesk (Back)", "Red Dot Not Award (Back)", "Gridlocked (Back)", "Hello Week 001 (Back)",
  "Hello Week 002 (Back)", "Monochrome Manifest (Back)", "Positive Space (Back)", "Whitespace Matters (Back)",
  "Command + K (Back)"
];

export function SpiralScroll() {
  const sRef = useRef<HTMLElement>(null);
  const stgRef = useRef<HTMLDivElement>(null);
  const lRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<any>(null);

  useEffect(() => {
    if (!sRef.current || !stgRef.current) return;
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([gsapMod, stMod]) => {
        if (cancelled || !sRef.current || !stgRef.current) return;
        try {
          const gsap = gsapMod.default;
          const ScrollTrigger = stMod.ScrollTrigger;
          gsap.registerPlugin(ScrollTrigger);
          const s = sRef.current, stg = stgRef.current, lbl = lRef.current;
          const n = ITEMS.length;
          const items = stg.querySelectorAll(".spiral-item");
          const R = 350, VS = 60, T = 2.5;
          items.forEach(el => gsap.set(el as HTMLElement, { x:0, y:0, z:0, scale:0.3, opacity:0, rotationY:0 }));
          stRef.current = ScrollTrigger.create({
            trigger: s,
            start: "top top",
            end: "+=6000",
            pin: true,
            scrub: 1,
            onUpdate: (self: any) => {
              try {
                const p = self.progress, re = 0.7, rp = Math.min(p/re, 1);
                items.forEach((el: any, i: number) => {
                  const h = el as HTMLElement;
                  const rs = (i/n)*0.8, re2 = rs+0.2;
                  if (rp < rs) {
                    gsap.set(h, { x:0, y:0, z:0, scale:0.3, opacity:0, rotationY:0 });
                  } else {
                    const ip = i/(n-1), a = ip*T*Math.PI*2;
                    const x = Math.cos(a)*R, y = (i-n/2)*VS, z = Math.sin(a)*R, sc = 1-ip*0.4;
                    const lp = Math.min(1, Math.max(0, (rp-rs)/(re2-rs)));
                    gsap.set(h, { x:x*lp, y:y*lp, z:z*lp, scale:0.3+(sc-0.3)*lp, opacity:lp, rotationY:0 });
                  }
                });
                if (p > re) {
                  const zp = (p-re)/(1-re);
                  gsap.set(stg, { rotationY: zp*120, scale: 1+zp*0.4 });
                } else {
                  gsap.set(stg, { rotationY:0, scale:1 });
                }
                if (lbl) {
                  const idx = Math.min(n-1, Math.floor(p*n));
                  const pp = (p*n)%1;
                  const op = pp<0.15 ? pp/0.15 : pp>0.85 ? (1-pp)/0.15 : 1;
                  if (lbl.textContent !== TITLES[idx]) lbl.textContent = TITLES[idx];
                  lbl.style.opacity = String(op);
                }
              } catch (e) { console.error("Spiral update error:", e); }
            },
            onLeaveBack: () => {
              try {
                items.forEach((el: any) => gsap.set(el as HTMLElement, { x:0, y:0, z:0, scale:0.3, opacity:0, rotationY:0 }));
                gsap.set(stg, { rotationY:0, scale:1 });
                if (lbl) lbl.style.opacity = "0";
              } catch (e) { console.error("Spiral leaveBack error:", e); }
            }
          });
        } catch (e) {
          console.error("Spiral GSAP init failed:", e);
        }
      })
      .catch((e) => console.error("Spiral GSAP load failed:", e));

    return () => {
      cancelled = true;
      try {
        if (stRef.current) stRef.current.kill();
      } catch (e) { console.error("Spiral cleanup error:", e); }
    };
  }, []);

  return (
    <section ref={sRef} className="relative h-screen w-full overflow-hidden bg-black flex items-center justify-center" style={{ perspective: "1600px" }}>
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[4] flex items-center gap-3 text-cream text-sm font-bold uppercase tracking-tight">
        <span className="border-b border-cream pb-0.5">spiral</span>
        <span className="opacity-30">•</span>
        <span className="opacity-50">list</span>
      </div>
      <div className="absolute top-24 right-6 z-[4]">
        <button className="flex items-center gap-2 rounded-full border border-cream/20 px-4 py-2 text-cream text-xs font-bold uppercase tracking-tight hover:bg-cream/10 transition-colors">menu <span className="h-1.5 w-1.5 rounded-full bg-cream" /></button>
      </div>
      <div className="absolute bottom-8 left-6 z-10 text-cream/40 text-xs font-bold uppercase tracking-tight">OUTFIT® • 3D Spiral • 2026</div>
      <div ref={stgRef} className="relative will-change-transform" style={{ transformStyle: "preserve-3d", width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
        {ITEMS.map((src,i) => (
          <div key={i} className="spiral-item absolute will-change-transform" style={{ top: "50%", left: "50%", transformStyle: "preserve-3d", width: "140px", height: "140px", marginLeft: "-70px", marginTop: "-70px" }}>
            <div className="w-full h-full overflow-hidden rounded-lg shadow-2xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}>
              <img src={src} alt={TITLES[i]} className="w-full h-full object-cover" loading="lazy" />
            </div>
          </div>
        ))}
      </div>
      <div ref={lRef} className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 px-6 py-3 rounded-full bg-cream text-black text-sm font-bold uppercase tracking-tight pointer-events-none transition-opacity duration-300" style={{ opacity: 0 }} />
    </section>
  );
}

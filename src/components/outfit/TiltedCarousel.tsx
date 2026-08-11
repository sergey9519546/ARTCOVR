"use client";
import { useEffect, useRef, useState } from "react";

// 26 images: 13 product fronts + 13 product backs (doubled from original 13)
const BASE = [
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
const ITEMS = BASE.map((s,i) => ({
  src: s,
  title: s.split("/").pop()?.replace(/-(front|back)\.jpg$/, "").replace(/-/g, " ") || "",
  bg: i%2===0 ? "bg-red" : "bg-[#d2cac3]"
}));
const CW = 300, CH = 300, CG = 20;

export function TiltedCarousel() {
  const sRef = useRef<HTMLElement>(null);
  const tRef = useRef<HTMLDivElement>(null);
  const [ai, setAi] = useState(0);
  const aiRef = useRef(0);
  const stRef = useRef<any>(null);

  useEffect(() => {
    if (!sRef.current || !tRef.current) return;
    let cancelled = false;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([gsapMod, stMod]) => {
        if (cancelled || !sRef.current || !tRef.current) return;
        try {
          const gsap = gsapMod.default;
          const ScrollTrigger = stMod.ScrollTrigger;
          gsap.registerPlugin(ScrollTrigger);
          const s = sRef.current, t = tRef.current;
          const tw = ITEMS.length*(CW+CG);
          const mt = Math.max(0, tw - window.innerWidth + CW);
          stRef.current = ScrollTrigger.create({
            trigger: s,
            start: "top top",
            end: "+=6000",
            pin: true,
            scrub: 0.8,
            onUpdate: (self: any) => {
              try {
                t.style.transform = `translateX(${-self.progress*mt}px)`;
                const c = window.innerWidth/2;
                const idx = Math.round((c + self.progress*mt - CW/2)/(CW+CG));
                const cl = Math.max(0, Math.min(ITEMS.length-1, idx));
                if (cl !== aiRef.current) { aiRef.current = cl; setAi(cl); }
              } catch (e) { console.error("Carousel update error:", e); }
            },
            onLeaveBack: () => {
              try {
                aiRef.current = 0;
                setAi(0);
                t.style.transform = "translateX(0px)";
              } catch (e) { console.error("Carousel leaveBack error:", e); }
            }
          });
        } catch (e) {
          console.error("Carousel GSAP init failed:", e);
        }
      })
      .catch((e) => console.error("Carousel GSAP load failed:", e));

    return () => {
      cancelled = true;
      try {
        if (stRef.current) stRef.current.kill();
      } catch (e) { console.error("Carousel cleanup error:", e); }
    };
  }, []);

  // Keyboard navigation (improvement #45) — arrow keys to scroll through carousel
  useEffect(() => {
    if (!sRef.current) return;
    const s = sRef.current;
    const onKey = (e: KeyboardEvent) => {
      // Only respond when carousel section is in viewport
      const rect = s.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = Math.max(0, Math.min(ITEMS.length-1, aiRef.current + dir));
        const targetY = window.scrollY + (next - aiRef.current) * (CW + CG) * 0.8;
        window.scrollTo({ top: targetY, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section ref={sRef} className="relative h-screen w-full overflow-hidden bg-cream flex items-center">
      <div className="absolute top-26 left-4 lg:left-6 text-xs font-bold uppercase tracking-tight z-10"><p>The Collection</p></div>
      <div className="absolute top-26 right-4 lg:right-6 text-xs font-bold uppercase tracking-tight tabular-nums z-10"><span>{String(ai+1).padStart(2,"0")}</span><span className="opacity-40"> / {String(ITEMS.length).padStart(2,"0")}</span></div>
      <div ref={tRef} className="flex items-center will-change-transform" style={{ gap: `${CG}px`, paddingLeft: "50%", transform: "translateX(0px)" }}>
        {ITEMS.map((item,i) => (
          <div key={i} className={`carousel-card flex-shrink-0 flex flex-col items-center gap-3 ${item.bg}`} style={{ width: `${CW}px`, height: `${CH}px` }}>
            <div className="w-full h-full overflow-hidden"><img src={item.src} alt={item.title} className="w-full h-full object-cover" loading="lazy" /></div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[60%] max-w-[600px] z-10">
        <div className="h-[2px] w-full bg-current/20 rounded-full overflow-hidden">
          <div className="h-full bg-current rounded-full transition-all duration-300" style={{ width: `${(ai/(ITEMS.length-1))*100}%` }} />
        </div>
      </div>
    </section>
  );
}

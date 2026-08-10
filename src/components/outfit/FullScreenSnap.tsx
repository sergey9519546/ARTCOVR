"use client";
import { useEffect, useRef, useState } from "react";

const MT = "FOR DELIVERING THOUGHTFUL, ELEGANT AND COMPELLING DESIGN • MADE TO BE WORN • OR JUDGED • OR BOTH • ";
const SS = [
  { id:"s1", bg:"bg-cream", fg:"text-black", title:"OUTFIT®", sub:"Signature Collection", desc:"Apparel for the creatively passionate.", img:"/assets/products/off-by-design-front.jpg", layout:"right-image" },
  { id:"s2", bg:"bg-black", fg:"text-cream", title:"Carefully", sub:"Designed", desc:"Every stitch, every kerning pair.", img:"/assets/products/specimen-no-hh01-front.jpg", layout:"left-image" },
  { id:"s3", bg:"bg-red", fg:"text-cream", title:"Made to", sub:"be worn", desc:"Or judged. Or both.", layout:"center-text" },
  { id:"s4", bg:"bg-cream", fg:"text-black", title:"Grid", sub:"System Go", desc:"Order in the chaos of design.", img:"/assets/products/grid-system-go-front.jpg", layout:"split" },
  { id:"s5", bg:"bg-black", fg:"text-cream", title:"©26", sub:"++hellohello", desc:"Created by the ++hellohello team.", layout:"center-text" }
];

export function FullScreenSnap() {
  const wRef = useRef<HTMLDivElement>(null);
  const mRef = useRef<HTMLDivElement>(null);
  const [iv, setIv] = useState(false);

  useEffect(() => {
    if (!wRef.current) return;
    const w = wRef.current;
    let rafId = 0;

    try {
      const obs = new IntersectionObserver((e) => setIv(e[0].isIntersecting), { threshold: 0.1 });
      obs.observe(w);

      const hs = () => {
        if (rafId !== 0) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          try {
            if (!mRef.current || !wRef.current) return;
            const r = wRef.current.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, -r.top/(r.height - window.innerHeight)));
            mRef.current.style.transform = `translateX(${-p*50}%)`;
          } catch (e) { console.error("Snap scroll error:", e); }
        });
      };
      window.addEventListener("scroll", hs, { passive: true });
      window.addEventListener("resize", hs, { passive: true });

      return () => {
        obs.disconnect();
        window.removeEventListener("scroll", hs);
        window.removeEventListener("resize", hs);
        if (rafId) cancelAnimationFrame(rafId);
      };
    } catch (e) {
      console.error("FullScreenSnap init failed:", e);
      return;
    }
  }, []);

  return (
    <div ref={wRef} className="relative">
      <div className={`fixed top-0 left-0 right-0 z-[2] h-12 bg-cream/90 backdrop-blur-sm border-b border-current/10 overflow-hidden flex items-center transition-opacity duration-300 ${iv?"opacity-100":"opacity-0 pointer-events-none"}`}>
        <div ref={mRef} className="whitespace-nowrap text-xs font-bold uppercase tracking-tight will-change-transform">
          {Array.from({length:8}).map((_,i) => <span key={i} className="mx-4">{MT}</span>)}
        </div>
      </div>
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[2] flex items-center gap-6 rounded-full bg-black/90 backdrop-blur-sm px-6 py-3 text-cream text-sm font-bold shadow-lg transition-opacity duration-300 ${iv?"opacity-100":"opacity-0 pointer-events-none"}`}>
        <span>OUTFIT®</span>
        <span className="opacity-50">|</span>
        <button className="link-hover">Menu</button>
      </div>
      <div style={{ scrollSnapType: "y proximity" }}>
        {SS.map(s => (
          <section key={s.id} className={`h-screen w-full ${s.bg} ${s.fg} flex items-center justify-center px-4 lg:px-6 pt-12`} style={{ scrollSnapAlign: "start" }}>
            <div className="max-w-6xl w-full">
              {s.layout==="center-text" && (
                <div className="text-center max-w-4xl mx-auto">
                  <h2 className="text-[15vw] md:text-[10vw] font-[900] tracking-tighter leading-[0.9]">{s.title}</h2>
                  <p className="mt-4 text-2xl md:text-4xl font-bold tracking-tight opacity-80">{s.sub}</p>
                  <p className="mt-8 text-sm md:text-base opacity-60 max-w-md mx-auto">{s.desc}</p>
                </div>
              )}
              {s.layout==="right-image" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div>
                    <h2 className="text-[12vw] md:text-[8vw] font-[900] tracking-tighter leading-[0.9]">{s.title}</h2>
                    <p className="mt-4 text-xl md:text-2xl font-bold tracking-tight opacity-80">{s.sub}</p>
                    <p className="mt-6 text-sm md:text-base opacity-60 max-w-md">{s.desc}</p>
                  </div>
                  {s.img && <div className="aspect-square w-full overflow-hidden rounded-lg"><img src={s.img} alt={s.title} className="w-full h-full object-cover" loading="lazy" /></div>}
                </div>
              )}
              {s.layout==="left-image" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  {s.img && <div className="aspect-square w-full overflow-hidden rounded-lg order-2 md:order-1"><img src={s.img} alt={s.title} className="w-full h-full object-cover" loading="lazy" /></div>}
                  <div className="order-1 md:order-2">
                    <h2 className="text-[12vw] md:text-[8vw] font-[900] tracking-tighter leading-[0.9]">{s.title}</h2>
                    <p className="mt-4 text-xl md:text-2xl font-bold tracking-tight opacity-80">{s.sub}</p>
                    <p className="mt-6 text-sm md:text-base opacity-60 max-w-md">{s.desc}</p>
                  </div>
                </div>
              )}
              {s.layout==="split" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  {s.img && <div className="aspect-square w-full overflow-hidden rounded-lg"><img src={s.img} alt={s.title} className="w-full h-full object-cover" loading="lazy" /></div>}
                  <div className="md:col-span-2">
                    <h2 className="text-[12vw] md:text-[7vw] font-[900] tracking-tighter leading-[0.9]">{s.title}</h2>
                    <p className="mt-4 text-xl md:text-2xl font-bold tracking-tight opacity-80">{s.sub}</p>
                    <p className="mt-6 text-sm md:text-base opacity-60 max-w-md">{s.desc}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

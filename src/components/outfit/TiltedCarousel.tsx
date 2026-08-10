"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
const BASE = ["/assets/products/off-by-design-front.jpg","/assets/products/kerned-confidence-front.jpg","/assets/products/specimen-no-hh01-front.jpg","/assets/products/grid-system-go-front.jpg","/assets/products/neutral-grotesk-front.jpg","/assets/products/red-dot-not-award-front.jpg","/assets/products/gridlocked-front.jpg","/assets/products/hello-week-001-front.jpg","/assets/products/hello-week-002-front.jpg","/assets/products/monochrome-manifest-front.jpg","/assets/products/positive-space-front.jpg","/assets/products/whitespace-matters-front.jpg","/assets/products/command-k-front.jpg"];
const ITEMS = BASE.map((s,i) => ({ src: s, title: s.split("/").pop()?.replace("-front.jpg","").replace(/-/g," ") || "", bg: i%2===0?"bg-red":"bg-[#d2cac3]" }));
const CW = 300, CH = 300, CG = 20;
export function TiltedCarousel() {
  const sRef = useRef<HTMLElement>(null);
  const tRef = useRef<HTMLDivElement>(null);
  const [ai, setAi] = useState(0);
  const aiRef = useRef(0);
  useEffect(() => {
    if (!sRef.current || !tRef.current) return;
    const s = sRef.current, t = tRef.current;
    gsap.registerPlugin(ScrollTrigger);
    const tw = ITEMS.length*(CW+CG);
    const mt = Math.max(0, tw-innerWidth+CW);
    const st = ScrollTrigger.create({ trigger: s, start: "top top", end: "+=5000", pin: true, scrub: 0.8, onUpdate: (self) => { t.style.transform = `translateX(${-self.progress*mt}px)`; const c = innerWidth/2; const idx = Math.round((c+self.progress*mt-CW/2)/(CW+CG)); const cl = Math.max(0,Math.min(ITEMS.length-1,idx)); if (cl !== aiRef.current) { aiRef.current = cl; setAi(cl); } }, onLeaveBack: () => { aiRef.current = 0; setAi(0); t.style.transform = "translateX(0px)"; } });
    return () => st.kill();
  }, []);
  return (<section ref={sRef} className="relative h-screen w-full overflow-hidden bg-cream flex items-center"><div className="absolute top-26 left-4 lg:left-6 text-xs font-bold uppercase tracking-tight z-10"><p>The Collection</p></div><div className="absolute top-26 right-4 lg:right-6 text-xs font-bold uppercase tracking-tight tabular-nums z-10"><span>{String(ai+1).padStart(2,"0")}</span><span className="opacity-40"> / {String(ITEMS.length).padStart(2,"0")}</span></div><div ref={tRef} className="flex items-center will-change-transform" style={{ gap: `${CG}px`, paddingLeft: "50%", transform: "translateX(0px)" }}>{ITEMS.map((item,i) => <div key={i} className={`carousel-card flex-shrink-0 flex flex-col items-center gap-3 ${item.bg}`} style={{ width: `${CW}px`, height: `${CH}px` }}><div className="w-full h-full overflow-hidden"><img src={item.src} alt={item.title} className="w-full h-full object-cover" loading="lazy" /></div></div>)}</div><div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[60%] max-w-[600px] z-10"><div className="h-[2px] w-full bg-current/20 rounded-full overflow-hidden"><div className="h-full bg-current rounded-full transition-all duration-300" style={{ width: `${(ai/(ITEMS.length-1))*100}%` }} /></div></div></section>);
}

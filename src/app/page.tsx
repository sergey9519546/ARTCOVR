"use client";
import { useEffect, useState, useCallback, Component, ReactNode } from "react";
import { Preloader } from "@/components/outfit/Preloader";
import { Header } from "@/components/outfit/Header";
import { ThemeSwitcher } from "@/components/outfit/ThemeSwitcher";
import { CustomCursor } from "@/components/outfit/CustomCursor";
import { MobileMenu } from "@/components/outfit/MobileMenu";
import { PageLayer } from "@/components/outfit/PageLayer";
import { PageTransition } from "@/components/outfit/PageTransition";
import { Hero } from "@/components/outfit/Hero";
import { ProductGrid } from "@/components/outfit/ProductGrid";
import { TiltedCarousel } from "@/components/outfit/TiltedCarousel";
import { SpiralScroll } from "@/components/outfit/SpiralScroll";
import { FullScreenSnap } from "@/components/outfit/FullScreenSnap";
import { Footer } from "@/components/outfit/Footer";
import { useLenis } from "@/hooks/outfit/useLenis";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { if (this.state.hasError) return null; return this.props.children; }
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [ptActive, setPtActive] = useState(false);
  useLenis(preloaderDone);
  useEffect(() => { if (preloaderDone) { document.documentElement.classList.add("loaded"); import("gsap").then(({default:gsap}) => { import("gsap/ScrollTrigger").then(({ScrollTrigger}) => { gsap.registerPlugin(ScrollTrigger); const l = (window as any).__lenis; if (l) l.on("scroll", ScrollTrigger.update); ScrollTrigger.refresh(); }); }); } }, [preloaderDone]);
  useEffect(() => { if (!preloaderDone) return; const hc = (e: MouseEvent) => { const t = e.target as HTMLElement; const pl = t.closest("[data-product='true']") as HTMLAnchorElement; if (pl) { e.preventDefault(); setPtActive(true); } }; document.addEventListener("click", hc); return () => document.removeEventListener("click", hc); }, [preloaderDone]);
  const htc = useCallback(() => setPtActive(false), []);
  return (<>
    <a href="#page" className="skip-link">Skip to content</a>
    <ErrorBoundary><CustomCursor /></ErrorBoundary>
    <ErrorBoundary><Preloader onComplete={() => setPreloaderDone(true)} /></ErrorBoundary>
    <ErrorBoundary><Header onMenuToggle={() => setMenuOpen(v=>!v)} menuOpen={menuOpen} /></ErrorBoundary>
    <ThemeSwitcher />
    <ErrorBoundary><MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} /></ErrorBoundary>
    <PageLayer />
    <ErrorBoundary><PageTransition active={ptActive} onComplete={htc} /></ErrorBoundary>
    <main id="page">
      <ErrorBoundary><Hero /></ErrorBoundary>
      <ErrorBoundary><ProductGrid /></ErrorBoundary>
      <ErrorBoundary><TiltedCarousel /></ErrorBoundary>
      <ErrorBoundary><SpiralScroll /></ErrorBoundary>
      <ErrorBoundary><FullScreenSnap /></ErrorBoundary>
      <ErrorBoundary><Footer /></ErrorBoundary>
    </main>
  </>);
}

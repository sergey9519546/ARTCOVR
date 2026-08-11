"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Preloader } from "@/components/outfit/Preloader";
import { Header } from "@/components/outfit/Header";
import { ThemeSwitcher } from "@/components/outfit/ThemeSwitcher";
import { CustomCursor } from "@/components/outfit/CustomCursor";
import { MobileMenu } from "@/components/outfit/MobileMenu";
import { PageLayer } from "@/components/outfit/PageLayer";
import { PageTransition } from "@/components/outfit/PageTransition";
import { Hero } from "@/components/outfit/Hero";
import { ProductGrid } from "@/components/outfit/ProductGrid";
import { ScrollProgress } from "@/components/outfit/ScrollProgress";
import { ErrorBoundary } from "@/components/outfit/ErrorBoundary";
import { useLenis } from "@/hooks/outfit/useLenis";
import { TiltedCarousel } from "@/components/outfit/TiltedCarousel";
import { SpiralScroll } from "@/components/outfit/SpiralScroll";
import { FullScreenSnap } from "@/components/outfit/FullScreenSnap";
import { Footer } from "@/components/outfit/Footer";

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [ptActive, setPtActive] = useState(false);
  const pendingUrl = useRef<string | null>(null);

  useLenis(preloaderDone);

  // Add loaded class + init GSAP after preloader — wrapped in try/catch for safety
  useEffect(() => {
    if (!preloaderDone) return;
    try {
      document.documentElement.classList.add("loaded");
      gsap.registerPlugin(ScrollTrigger);
      const l = (window as any).__lenis;
      if (l) l.on("scroll", ScrollTrigger.update);
      ScrollTrigger.refresh();
    } catch (e) {
      console.error("GSAP init failed:", e);
    }
  }, [preloaderDone]);

  // Product click handler for page transition — captures href, prevents default, triggers transition
  useEffect(() => {
    if (!preloaderDone) return;
    const hc = (e: MouseEvent) => {
      try {
        const t = e.target as HTMLElement;
        const pl = t.closest("[data-product='true']") as HTMLAnchorElement;
        if (pl && pl.href) {
          e.preventDefault();
          pendingUrl.current = pl.href;
          setPtActive(true);
        }
      } catch (err) {
        console.error("Click handler error:", err);
      }
    };
    document.addEventListener("click", hc);
    return () => document.removeEventListener("click", hc);
  }, [preloaderDone]);

  // Global error handlers — prevent unhandled errors from breaking the page
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => console.error("Unhandled rejection:", e.reason);
    const onError = (e: ErrorEvent) => console.error("Global error:", e.message);
    window.addEventListener("unhandledrejection", onUnhandled);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.removeEventListener("error", onError);
    };
  }, []);

  // Navigate to product page after transition completes
  const htc = useCallback(() => {
    setPtActive(false);
    if (pendingUrl.current) {
      const url = pendingUrl.current;
      pendingUrl.current = null;
      // Use a small delay to let the transition finish visually
      setTimeout(() => router.push(url), 100);
    }
  }, [router]);

  return (<>
    <a href="#page" className="skip-link">Skip to content</a>
    <ErrorBoundary label="scroll-progress"><ScrollProgress /></ErrorBoundary>
    <ErrorBoundary label="cursor"><CustomCursor /></ErrorBoundary>
    <ErrorBoundary label="preloader"><Preloader onComplete={() => setPreloaderDone(true)} /></ErrorBoundary>
    <ErrorBoundary label="header"><Header onMenuToggle={() => setMenuOpen(v=>!v)} menuOpen={menuOpen} /></ErrorBoundary>
    <ErrorBoundary label="theme"><ThemeSwitcher /></ErrorBoundary>
    <ErrorBoundary label="mobile-menu"><MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} /></ErrorBoundary>
    <ErrorBoundary label="page-layer"><PageLayer /></ErrorBoundary>
    <ErrorBoundary label="page-transition"><PageTransition active={ptActive} onComplete={htc} /></ErrorBoundary>
    <main id="page">
      <ErrorBoundary label="hero"><Hero /></ErrorBoundary>
      <ErrorBoundary label="products"><ProductGrid /></ErrorBoundary>
      <ErrorBoundary label="carousel"><TiltedCarousel /></ErrorBoundary>
      <ErrorBoundary label="spiral"><SpiralScroll /></ErrorBoundary>
      <ErrorBoundary label="snap"><FullScreenSnap /></ErrorBoundary>
      <ErrorBoundary label="footer"><Footer /></ErrorBoundary>
    </main>
  </>);
}

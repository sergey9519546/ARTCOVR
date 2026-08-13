"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomCursor } from "@/components/parity/CustomCursor";
import { ErrorBoundary } from "@/components/parity/ErrorBoundary";
import { Footer } from "@/components/parity/Footer";
import { FullScreenSnap } from "@/components/parity/FullScreenSnap";
import { Header } from "@/components/parity/Header";
import { Hero } from "@/components/parity/Hero";
import { MobileMenu } from "@/components/parity/MobileMenu";
import { PageLayer } from "@/components/parity/PageLayer";
import { PageTransition } from "@/components/parity/PageTransition";
import { Preloader } from "@/components/parity/Preloader";
import { ProductGrid } from "@/components/parity/ProductGrid";
import { ScrollProgress } from "@/components/parity/ScrollProgress";
import { SpiralScroll } from "@/components/parity/SpiralScroll";
import { ThemeSwitcher } from "@/components/parity/ThemeSwitcher";
import { TiltedCarousel } from "@/components/parity/TiltedCarousel";
import { useLenis } from "@/hooks/artcovr/useLenis";

const STATIC_MEDIA_QUERY =
  "(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 767px)";

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [transitionActive, setTransitionActive] = useState(false);
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    const updateMode = () => setMotionAllowed(!mediaQuery.matches);
    updateMode();
    mediaQuery.addEventListener("change", updateMode);
    return () => mediaQuery.removeEventListener("change", updateMode);
  }, []);

  useLenis(preloaderDone && motionAllowed);

  useEffect(() => {
    if (!preloaderDone) return;

    document.documentElement.classList.add("loaded");
    gsap.registerPlugin(ScrollTrigger);
    const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 100);

    return () => {
      window.clearTimeout(refreshTimer);
      document.documentElement.classList.remove("loaded");
    };
  }, [preloaderDone]);

  useEffect(() => {
    if (!preloaderDone) return;

    const handleArtworkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement;
      const artworkLink = target.closest(
        "a[data-artwork='true'], a[data-product='true']",
      ) as HTMLAnchorElement | null;

      if (!artworkLink || artworkLink.target === "_blank") return;
      const destination = new URL(artworkLink.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      event.preventDefault();
      pendingUrl.current = `${destination.pathname}${destination.search}${destination.hash}`;
      setTransitionActive(true);
    };

    document.addEventListener("click", handleArtworkClick);
    return () => document.removeEventListener("click", handleArtworkClick);
  }, [preloaderDone]);

  const finishTransition = useCallback(() => {
    const destination = pendingUrl.current;
    pendingUrl.current = null;
    setTransitionActive(false);
    if (destination) router.push(destination);
  }, [router]);

  const pageBlocked = hydrated && (!preloaderDone || transitionActive);

  return (
    <>
      <a href="#page" className="skip-link">
        Skip to content
      </a>
      <ErrorBoundary label="scroll-progress">
        <ScrollProgress />
      </ErrorBoundary>
      <ErrorBoundary label="cursor">
        <CustomCursor />
      </ErrorBoundary>
      <ErrorBoundary label="preloader">
        <Preloader onComplete={() => setPreloaderDone(true)} />
      </ErrorBoundary>
      <div id="page-shell" aria-hidden={pageBlocked} inert={pageBlocked ? true : undefined}>
        <ErrorBoundary label="header">
          <Header
            onMenuToggle={() => setMenuOpen((open) => !open)}
            menuOpen={menuOpen}
          />
        </ErrorBoundary>
        <ErrorBoundary label="theme">
          <ThemeSwitcher />
        </ErrorBoundary>
        <ErrorBoundary label="mobile-menu">
          <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </ErrorBoundary>
      </div>
      <ErrorBoundary label="page-layer">
        <PageLayer />
      </ErrorBoundary>
      <ErrorBoundary label="page-transition">
        <PageTransition
          active={transitionActive}
          onComplete={finishTransition}
        />
      </ErrorBoundary>
      <main id="page" aria-hidden={pageBlocked} inert={pageBlocked ? true : undefined}>
        <ErrorBoundary label="hero">
          <Hero />
        </ErrorBoundary>
        <ErrorBoundary label="artwork-grid">
          <ProductGrid />
        </ErrorBoundary>
        <ErrorBoundary label="carousel">
          <TiltedCarousel />
        </ErrorBoundary>
        <ErrorBoundary label="spiral">
          <SpiralScroll />
        </ErrorBoundary>
        <ErrorBoundary label="editorial">
          <FullScreenSnap />
        </ErrorBoundary>
        <ErrorBoundary label="footer">
          <Footer />
        </ErrorBoundary>
      </main>
    </>
  );
}

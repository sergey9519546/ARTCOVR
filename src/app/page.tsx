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
import { ScrollJourney } from "@/components/parity/ScrollJourney";
import { ScrollProgress } from "@/components/parity/ScrollProgress";
import { useLenis } from "@/hooks/artcovr/useLenis";
import { featuredArtworks as displayArtworks } from "@/lib/artcovr/artworks";

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
    const updateMode = () => {
      const allowed = !mediaQuery.matches;
      setMotionAllowed(allowed);
      if (!allowed) {
        setPreloaderDone(true);
      }
    };
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
    if (!preloaderDone || !motionAllowed) return;

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
  }, [preloaderDone, motionAllowed]);

  const finishTransition = useCallback(() => {
    const destination = pendingUrl.current;
    pendingUrl.current = null;
    setTransitionActive(false);
    if (destination) router.push(destination);
  }, [router]);

  // Stable identities: MobileMenu's modal effect keys off its `onClose`, and an
  // inline arrow recreated on every Home render would tear that effect down and
  // rebuild it — restoring focus to the hamburger and re-capturing the inert
  // baseline — every time an unrelated state change (a matchMedia update on
  // rotate, say) re-renders this page.
  const openPreloaderGate = useCallback(() => setPreloaderDone(true), []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // The intro and the page transition may block the page, but never
  // indefinitely. Both only unblock it through a callback fired by a child, and
  // every child here sits inside an <ErrorBoundary> that renders null on error
  // — so a Preloader that throws after mount would leave the page permanently
  // inert and aria-hidden, with `html.loaded` never applied (which keeps
  // #header and #theme-switcher at opacity 0). These ceilings sit well past the
  // children's own completion timings and are cleared the moment the normal
  // callback lands, so the intro is untouched when nothing goes wrong.
  useEffect(() => {
    if (preloaderDone) return;
    // Preloader calls onComplete at 3500ms.
    const failsafe = window.setTimeout(openPreloaderGate, 6000);
    return () => window.clearTimeout(failsafe);
  }, [openPreloaderGate, preloaderDone]);

  useEffect(() => {
    if (!transitionActive) return;
    // PageTransition calls onComplete at 1500ms.
    const failsafe = window.setTimeout(finishTransition, 3000);
    return () => window.clearTimeout(failsafe);
  }, [finishTransition, transitionActive]);

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
        <Preloader onComplete={openPreloaderGate} />
      </ErrorBoundary>
      <div id="page-shell" aria-hidden={pageBlocked} inert={pageBlocked ? true : undefined}>
        <ErrorBoundary label="header">
          <Header onMenuToggle={toggleMenu} menuOpen={menuOpen} />
        </ErrorBoundary>
        <ErrorBoundary label="mobile-menu">
          <MobileMenu open={menuOpen} onClose={closeMenu} />
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
        {displayArtworks.length === 0 ? (
          <section
            aria-label="Catalog status"
            className="px-4 pb-24 lg:px-6"
          >
            <div className="border-y-2 border-current py-16">
              <p className="text-[11px] font-bold uppercase tracking-[.1em]">
                Launch in progress
              </p>
              <h2 className="mt-5 max-w-[16ch] text-4xl font-extrabold leading-[.9] tracking-tighter md:text-6xl">
                The first approved collection is being prepared.
              </h2>
              <p className="mt-6 max-w-[52ch] text-sm leading-6">
                Every ARTCOVR cover goes through explicit rights and publication
                approval before it can appear here. The launch archive opens as
                soon as the first works clear that review.
              </p>
            </div>
          </section>
        ) : null}
        <ErrorBoundary label="artwork-grid">
          <ProductGrid />
        </ErrorBoundary>
        <ErrorBoundary label="journey">
          <ScrollJourney enabled={preloaderDone && motionAllowed} />
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

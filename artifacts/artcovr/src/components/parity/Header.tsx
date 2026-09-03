"use client";

import Link from "@/components/compat/Link";
import { useLocation } from "wouter";
import { useArtcovrAuth } from "@/lib/artcovr/auth";
import { useEffect, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Header({
  onMenuToggle,
  menuOpen = false,
}: {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}) {
   const [pathname] = useLocation();
const archiveSelected = pathname === "/archive" || pathname.startsWith("/product/");
   const accountSelected = pathname === "/my-images";
    const { isLoaded, isSignedIn, signOut } = useArtcovrAuth();
    const [showBrand, setShowBrand] = useState(false);

    useEffect(() => {
      const heroWordmark = document.getElementById("hero-wordmark");
      if (!heroWordmark) {
        setShowBrand(true);
        return;
      }

      const observer = new IntersectionObserver(([entry]) => {
        setShowBrand(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      });
      observer.observe(heroWordmark);
      return () => observer.disconnect();
    }, []);

   return (
     <nav
       id="header"
       aria-label="Primary navigation"
       className="fixed top-0 left-0 z-[3] flex w-full items-center justify-between text-[var(--foreground)]"
     >
       <div className="mx-auto flex w-full items-center justify-between px-4 py-6 lg:px-6 lg:py-8">
          <Link
            className={`artcovr-wordmark artcovr-wordmark-optical mr-2 inline-flex min-h-11 items-center text-2xl transition-[opacity,visibility] duration-300 lg:mr-6 ${showBrand ? "visible opacity-100" : "pointer-events-none invisible opacity-0"}`}
            href="/"
            aria-label="ARTCOVR home"
            aria-hidden={!showBrand}
            tabIndex={showBrand ? undefined : -1}
          >
           ARTCOVR
         </Link>
          <div className="flex items-center gap-3 lg:gap-16">
            <ul className="text-md flex items-center gap-6 tracking-tight lg:gap-16 lg:text-2xl">
             <li>
               <Link className="link-hover" data-selected={archiveSelected || undefined} aria-current={archiveSelected ? "page" : undefined} href="/archive">archive</Link>
             </li>
             <li>
                <Link className="link-hover" data-selected={accountSelected || undefined} aria-current={accountSelected ? "page" : undefined} href="/my-images">my images</Link>
             </li>
              <li className="lg:hidden">
               <button
                 type="button"
                 className="min-w-[2.625rem]"
                 onClick={onMenuToggle}
                 aria-expanded={menuOpen}
                 aria-controls="mobile-menu"
               >
                 {menuOpen ? "Close" : "Menu"}
               </button>
             </li>
           </ul>
             <div className="hidden items-center gap-4 text-sm lg:flex">
              {!isLoaded ? (
                <span className="opacity-60" aria-live="polite">account…</span>
              ) : isSignedIn ? (
                <button type="button" className="link-hover" onClick={() => void signOut({ redirectUrl: "/" })}>log out</button>
              ) : (
                <Link className="link-hover" href="/sign-in">sign in</Link>
              )}
            </div>
            <div className="hidden h-[1.265625rem] w-24 lg:block" aria-hidden="true" />
           <ThemeSwitcher />
         </div>
       </div>
     </nav>
   );
}

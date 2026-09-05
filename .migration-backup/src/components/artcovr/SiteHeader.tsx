"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileMenu } from "@/components/parity/MobileMenu";
import { ThemeToggle } from "@/components/artcovr/ThemeToggle";
import { PRIMARY_NAV_ITEMS } from "@/lib/artcovr/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    document.documentElement.classList.add("loaded");
  }, []);

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      {/*
        * Same resolution as src/components/parity/Header.tsx: `text-white` is
        * cream (#f3ecd9) here, and under mix-blend-difference the fixed bar
        * inverted against whatever full-bleed artwork scrolled beneath it,
        * resolving to arbitrary hues. A child cannot opt out of an ancestor's
        * blend group, so the nav paints the theme colour directly instead.
        */}
      <header className="fixed inset-x-0 top-0 z-30 text-[var(--foreground)]">
        <nav aria-label="Primary" className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 lg:px-7">
          <Link href="/" className="flex min-h-11 items-center text-sm font-extrabold tracking-tight" aria-label="ARTCOVR home" data-menu-focus-fallback>
            ARTCOVR
          </Link>
          <div className="hidden items-center gap-8 text-[11px] font-bold uppercase tracking-[0.08em] md:flex">
            {PRIMARY_NAV_ITEMS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`flex min-h-11 items-center ${pathname === link.href ? "border-b border-current" : "link-hover"}`}
              >
                {link.label}
              </Link>
            ))}
            <ThemeToggle />
            </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="artcovr-js-menu-trigger flex min-h-11 min-w-11 items-center justify-end text-xs font-bold uppercase tracking-[.08em] md:hidden"
          >
            Menu
          </button>
        </nav>
      </header>
      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </>
  );
}

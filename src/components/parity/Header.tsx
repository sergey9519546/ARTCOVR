"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Header({
  onMenuToggle,
  menuOpen = false,
}: {
  onMenuToggle?: () => void;
  menuOpen?: boolean;
}) {
  const pathname = usePathname();
  const archiveSelected = pathname === "/archive" || pathname.startsWith("/product/");
  const accountSelected = pathname === "/my-images";

  /*
   * The nav previously rendered cream under mix-blend-difference. Over the
   * cream ground that resolves to black, but it composites in its own blend
   * layer, so the small wordmark rasterised differently from the plain-black
   * hero lockup, and inverted to arbitrary colours over artwork scrolling
   * beneath the fixed bar. The wordmark has to read as the hero mark at a
   * smaller size, and a child cannot opt out of an ancestor's blend group, so
   * the nav paints the theme colour directly instead.
   */
  return (
    <nav
      id="header"
      aria-label="Primary navigation"
      className="fixed top-0 left-0 z-[3] flex w-full items-center justify-between text-[var(--foreground)]"
    >
      <div className="mx-auto flex w-full items-center justify-between px-4 py-8 lg:px-6">
        <Link className="artcovr-wordmark artcovr-wordmark-optical mr-2 text-xl lg:mr-6" href="/" aria-label="ARTCOVR home">
          ARTCOVR
        </Link>
        <div className="flex items-center gap-3 md:gap-16">
          <ul className="text-md flex gap-8 tracking-tight md:items-center md:gap-16 md:text-2xl">
            <li className="hidden md:block">
              <Link className="link-hover" data-selected={archiveSelected || undefined} aria-current={archiveSelected ? "page" : undefined} href="/archive">Art Search</Link>
            </li>
            <li>
              <Link className="link-hover" data-selected={accountSelected || undefined} aria-current={accountSelected ? "page" : undefined} href="/my-images">Cart</Link>
            </li>
            <li className="md:hidden">
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
          <div className="hidden h-[1.265625rem] w-[3.875rem] md:block" />
        </div>
      </div>
    </nav>
  );
}

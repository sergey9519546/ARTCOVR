"use client";

import { useEffect, useRef } from "react";
import { useAuth, useClerk } from "@clerk/react";
import Link from "@/components/compat/Link";

const items = [
  { label: "archive", href: "/archive" },
  { label: "my images", href: "/my-images" },
];

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const visibleItems = isSignedIn
    ? [...items, { label: "curation", href: "/catalog-intelligence" }]
    : items;
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // The modal effect below must survive parent re-renders that hand down a
  // fresh inline callback. Its cleanup restores body scrolling, the captured
  // inert baseline, and focus, so re-running it on every parent render would
  // yank focus back to the opener and re-capture the baseline from an
  // already-modified DOM. Read the latest callback through a ref instead.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // The overlay itself has no breakpoint gate, but its only close button — and
  // every hamburger that opens it — is `md:hidden`. Widening past the `md`
  // breakpoint with the menu open would leave a full-screen overlay that a
  // mouse-only user cannot dismiss, so close it on that crossing.
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeWhenDesktop = () => {
      if (desktop.matches) onCloseRef.current();
    };
    closeWhenDesktop();
    desktop.addEventListener("change", closeWhenDesktop);
    return () => desktop.removeEventListener("change", closeWhenDesktop);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // Only currently-rendered controls can hold focus. Counting the
      // `md:hidden` close button would make the first/last comparisons below
      // test against a node that can never be `document.activeElement`, which
      // lets Shift+Tab walk straight out of the dialog.
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const main = document.querySelector<HTMLElement>("main");
    const pageHeader = document.querySelector<HTMLElement>("header, nav#header");
    const mainWasInert = main?.inert ?? false;
    const headerWasInert = pageHeader?.inert ?? false;
    if (main) main.inert = true;
    if (pageHeader) pageHeader.inert = true;
    document.body.style.overflow = "hidden";
    const focusCloseButton = () => {
      closeButton.current?.focus({ preventScroll: true });
      if (document.activeElement !== closeButton.current) {
        window.requestAnimationFrame(() => {
          closeButton.current?.focus({ preventScroll: true });
        });
      }
    };
    const focusTimer = window.setTimeout(focusCloseButton, 30);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(focusTimer);
      if (main) main.inert = mainWasInert;
      if (pageHeader) pageHeader.inert = headerWasInert;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <div
      ref={dialog}
      id="mobile-menu"
      role="dialog"
      aria-modal={open ? "true" : undefined}
      aria-label="Navigation menu"
      className={`fixed inset-0 z-40 flex h-dvh w-full items-center justify-center overflow-y-auto bg-black text-white dark:bg-white dark:text-black ${open ? "" : "invisible"}`}
      aria-hidden={!open}
      inert={!open ? true : undefined}
    >
      <div className="flex min-h-dvh w-full flex-col justify-between px-4 py-6 lg:px-6">
        <button ref={closeButton} type="button" className="ml-auto flex min-h-11 min-w-11 items-center justify-end text-sm font-bold uppercase md:hidden" onClick={onClose}>
          Close
        </button>
        <ul className="my-6 flex w-full flex-col text-[clamp(2rem,10vw,3rem)] font-normal leading-[.94] tracking-tight md:my-12 md:text-6xl">
          {visibleItems.map((item, index) => (
            <li key={item.label} className="overflow-hidden">
              <a
                className="link-hover block w-fit py-2"
                href={item.href}
                onClick={onClose}
                style={{
                  opacity: open ? 1 : 0,
                  transform: open ? "translateY(0)" : "translateY(100%)",
                  transition: `opacity 0.6s cubic-bezier(0.19,1,0.22,1) ${0.1 + index * 0.07}s, transform 0.6s cubic-bezier(0.19,1,0.22,1) ${0.1 + index * 0.07}s`,
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
          <div className="flex flex-col gap-3 text-sm">
            {!isLoaded ? (
              <span className="opacity-70" aria-live="polite">Account loading…</span>
            ) : isSignedIn ? (
              <button type="button" className="link-hover w-fit" onClick={() => { onClose(); void signOut({ redirectUrl: "/" }); }}>Log out</button>
            ) : (
              <div className="flex gap-4">
                <Link href="/sign-in" className="link-hover" onClick={onClose}>Sign in</Link>
                <Link href="/sign-up" className="link-hover" onClick={onClose}>Sign up</Link>
              </div>
            )}
          <p className="opacity-70">Cover art, made yours.</p>
          <p className="opacity-70">© 2026 ARTCOVR</p>
        </div>
      </div>
    </div>
  );
}

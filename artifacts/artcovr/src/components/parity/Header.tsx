"use client";

import Link from "@/components/compat/Link";
import { useLocation } from "wouter";
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

   return (
     <nav
       id="header"
       aria-label="Primary navigation"
       className="fixed top-0 left-0 z-[3] flex w-full items-center justify-between text-[var(--foreground)]"
     >
       <div className="mx-auto flex w-full items-center justify-between px-4 py-6 lg:px-6 lg:py-8">
         <Link className="artcovr-wordmark artcovr-wordmark-optical mr-2 inline-flex min-h-11 items-center text-2xl lg:mr-6" href="/" aria-label="ARTCOVR home">
           ARTCOVR
         </Link>
         <div className="flex items-center gap-3 md:gap-16">
           <ul className="text-md flex items-center gap-6 tracking-tight md:gap-16 md:text-2xl">
             <li>
               <Link className="link-hover" data-selected={archiveSelected || undefined} aria-current={archiveSelected ? "page" : undefined} href="/archive">archive</Link>
             </li>
             <li>
               <Link className="link-hover" data-selected={accountSelected || undefined} aria-current={accountSelected ? "page" : undefined} href="/my-images">my cart</Link>
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
           <div className="hidden h-[1.265625rem] w-[3.875rem] md:block" aria-hidden="true" />
           <ThemeSwitcher />
         </div>
       </div>
     </nav>
   );
}

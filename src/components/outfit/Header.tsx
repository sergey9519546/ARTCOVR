"use client";
import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { OutfitHeaderLogo } from "./Svgs";
export function Header({ onMenuToggle, menuOpen = false }: { onMenuToggle?: () => void; menuOpen?: boolean }) {
  const [bagCount, setBagCount] = useState(0);
  useEffect(() => { try { const b = JSON.parse(localStorage.getItem("bag")||"[]"); setBagCount(Array.isArray(b)?b.length:0); } catch {} }, []);
  return (<nav id="header" className="red:text-[oklab(0.73_-0.14_-0.1)] fixed top-0 left-0 z-[3] flex w-full items-center justify-between text-white mix-blend-difference"><div className="mx-auto flex w-full items-center justify-between px-4 py-8 lg:px-6"><a className="mr-2 lg:mr-6" href="/" aria-label="OUTFIT home"><OutfitHeaderLogo /><span className="sr-only">OUTFIT®</span></a><div className="flex items-center gap-3 md:gap-16"><ul className="text-md flex gap-8 tracking-tight md:items-center md:gap-16 md:text-2xl"><li className="hidden md:block"><a className="link-hover" data-selected="true" href="/">Shop</a></li><li><a className="link-hover" href="/bag">Bag <span>(<NumberFlow value={bagCount} />)</span></a></li><li className="md:hidden"><button type="button" className="min-w-[2.625rem]" onClick={onMenuToggle} aria-expanded={menuOpen} aria-label="Toggle menu">{menuOpen ? "Close" : "Menu"}</button></li></ul><div className="hidden h-[1.265625rem] w-[3.875rem] md:block" /></div></div></nav>);
}

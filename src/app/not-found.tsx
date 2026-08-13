import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false, noarchive: true },
};

export default function NotFound() { return <main className="grid min-h-[100dvh] place-items-center bg-[#f3eee6] px-4 text-[#0b0b0b]"><div className="border-t-2 border-current pt-5"><p className="text-[11px] font-bold uppercase tracking-[.1em]">404</p><h1 className="mt-5 text-6xl font-extrabold tracking-tighter md:text-8xl">NOT IN THIS ARCHIVE.</h1><Link href="/archive" className="artcovr-button mt-8 inline-block px-5 py-4 text-xs font-bold uppercase tracking-[.08em]">Return to archive</Link></div></main>; }

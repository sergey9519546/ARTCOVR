import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
export function PublicPage({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) { return <><SiteHeader /><main id="main" className="mx-auto max-w-[1000px] px-4 pb-24 pt-32 lg:px-7"><div className="border-t-2 border-current pt-5"><p className="text-[11px] font-bold uppercase tracking-[.1em] opacity-60">{eyebrow}</p><h1 className="mt-5 text-6xl font-extrabold leading-[.84] tracking-tighter md:text-8xl">{title}</h1></div><div className="mt-14 max-w-[68ch] text-base leading-7">{children}</div></main><SiteFooter /></>; }

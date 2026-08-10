"use client";
import { OutfitWordmark } from "./Svgs";
export function PageLayer({ active = false }: { active?: boolean }) {
  return (<div id="layer" className={`red:text-white red:bg-red pointer-events-none fixed inset-0 z-[3] flex items-center justify-center bg-black text-white dark:bg-white dark:text-black${active?" active":""}`} aria-hidden="true"><div className="max-w-[14rem]"><OutfitWordmark /></div></div>);
}

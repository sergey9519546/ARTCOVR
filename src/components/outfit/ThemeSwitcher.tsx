"use client";
import { useTheme, type Theme } from "@/hooks/outfit/useTheme";
const THEMES: { id: Theme; label: string; bg: string; shadow: string }[] = [
  { id: "dark", label: "Switch to dark theme", bg: "bg-black", shadow: "shadow-[inset_0_0_0_0.05em_black]" },
  { id: "light", label: "Switch to light theme", bg: "bg-cream", shadow: "shadow-[inset_0_0_0_0.05em_black]" },
  { id: "red", label: "Switch to red theme", bg: "bg-red", shadow: "shadow-[inset_0_0_0_0.05em_#122519]" },
];
export function ThemeSwitcher() {
  const { theme, setTheme, mounted } = useTheme();
  const i = THEMES.findIndex(t => t.id === theme);
  return (<div id="theme-switcher" className="fixed top-[2.56rem] right-6 z-[3] hidden md:block"><div className="relative flex gap-1"><span className="absolute top-0 left-0 rounded-full pointer-events-none z-10 h-1 w-1 bg-cream" style={{ transform: `translate(${Math.max(0,i)*1.4375}rem,0)`, opacity: mounted?1:0 }} />{THEMES.map(t => <button key={t.id} type="button" onClick={() => setTheme(t.id)} aria-label={t.label} aria-pressed={theme===t.id} className={`inline-block rounded-full transition-all duration-200 ease-out h-[1.125rem] w-[1.125rem] ${t.bg} hover:scale-110 ${t.shadow}`} />)}</div></div>);
}

"use client";
import { useTheme, type Theme } from "@/hooks/artcovr/useTheme";
const THEMES: { id: Theme; label: string; bg: string; shadow: string }[] = [
  { id: "dark", label: "Switch to dark theme", bg: "bg-black", shadow: "shadow-[inset_0_0_0_0.05em_black]" },
  { id: "light", label: "Switch to light theme", bg: "bg-cream", shadow: "shadow-[inset_0_0_0_0.05em_black]" },
];
export function ThemeSwitcher() {
  const { theme, setTheme, mounted } = useTheme();
  const i = THEMES.findIndex((t) => t.id === theme);
  const indicatorClass = theme === "dark" ? "bg-cream" : "bg-black";

  return (
    <div id="theme-switcher" className="fixed top-6 right-5 z-[3] hidden md:block">
      <div className="relative flex gap-1">
        <span
          className={`pointer-events-none absolute top-1/2 left-[1.1rem] z-10 h-1.5 w-1.5 rounded-full transition-transform duration-200 ${indicatorClass}`}
          style={{ transform: `translate(${Math.max(0, i) * 3}rem, -50%)`, opacity: mounted ? 1 : 0 }}
        />
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-label={t.label}
            aria-pressed={theme === t.id}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-transform duration-200 ease-out hover:scale-105"
          >
            <span
              aria-hidden="true"
              className={`h-[1.125rem] w-[1.125rem] rounded-full ${t.bg} ${t.shadow} ${theme === t.id ? "ring-1 ring-current" : "opacity-90"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

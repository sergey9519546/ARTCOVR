"use client";

import { useTheme, type Theme } from "@/hooks/artcovr/useTheme";

const SWATCH_RING = "shadow-[inset_0_0_0_0.05em_var(--foreground)]";
const THEMES: { id: Theme; label: string; bg: string; shadow: string }[] = [
  {
    id: "dark",
    label: "Switch to dark theme",
    bg: "bg-black",
    shadow: SWATCH_RING,
  },
  {
    id: "light",
    label: "Switch to light theme",
    bg: "bg-cream",
    shadow: SWATCH_RING,
  },
];

export function ThemeSwitcher() {
  const { theme, setTheme, mounted } = useTheme();
  const index = THEMES.findIndex((candidate) => candidate.id === theme);
  const indicatorClass = theme === "dark" ? "bg-cream" : "bg-black";

  return (
    <div id="theme-switcher" className="fixed top-6 right-5 z-[3] hidden md:block">
      <div className="relative flex gap-1">
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 left-[1.1rem] z-10 h-1.5 w-1.5 rounded-full transition-transform duration-200 ${indicatorClass}`}
          style={{
            transform: `translate(${Math.max(0, index) * 3}rem, -50%)`,
            opacity: mounted ? 1 : 0,
          }}
        />
        {THEMES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setTheme(candidate.id)}
            aria-label={candidate.label}
            aria-pressed={theme === candidate.id}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-transform duration-200 ease-out hover:scale-105"
          >
            <span
              aria-hidden="true"
              className={`h-[1.125rem] w-[1.125rem] rounded-full ${candidate.bg} ${candidate.shadow} ${theme === candidate.id ? "ring-1 ring-current" : "opacity-90"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

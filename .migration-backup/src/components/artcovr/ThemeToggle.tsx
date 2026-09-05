"use client";

import { THEMES, useTheme } from "@/hooks/artcovr/useTheme";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();
  if (!mounted) return null;
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  return (
    <button
      type="button"
      className="theme-control link-hover flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Color theme is ${theme}. Switch to ${nextTheme} theme`}
    >
      Theme: {theme}
    </button>
  );
}

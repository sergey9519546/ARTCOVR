"use client";

import { useTheme } from "@/hooks/artcovr/useTheme";

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useTheme();
  if (!mounted) return null;
  return (
    <button
      className="theme-control link-hover flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

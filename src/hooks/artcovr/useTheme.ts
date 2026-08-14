"use client";
import { useCallback, useEffect, useState } from "react";
export type Theme = "light" | "dark";
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("theme"); } catch {}
    const current = document.documentElement.getAttribute("data-theme");
    const next: Theme = stored === "light" || stored === "dark"
      ? stored
      : current === "light" || current === "dark"
        ? current
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setThemeState(next);
    setMounted(true);
  }, []);
  const setTheme = useCallback((n: Theme) => { setThemeState(n); document.documentElement.setAttribute("data-theme", n); try { localStorage.setItem("theme", n); } catch {} }, []);
  return { theme, setTheme, mounted };
}

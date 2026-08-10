"use client";
import { useCallback, useEffect, useState } from "react";
export type Theme = "light" | "dark" | "red";
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("red");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const c = (document.documentElement.getAttribute("data-theme") as Theme) || "red"; setThemeState(c); setMounted(true); }, []);
  const setTheme = useCallback((n: Theme) => { setThemeState(n); document.documentElement.setAttribute("data-theme", n); try { localStorage.setItem("theme", n); } catch {} }, []);
  return { theme, setTheme, mounted };
}

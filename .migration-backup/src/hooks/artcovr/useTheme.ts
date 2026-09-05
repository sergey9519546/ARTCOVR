"use client";
import { useCallback, useEffect, useState } from "react";

export const THEMES = ["light", "dark", "red"] as const;
export type Theme = (typeof THEMES)[number];

const THEME_STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "artcovr:theme-change";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.includes(value as Theme);
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {}

    const current = document.documentElement.getAttribute("data-theme");
    const next = isTheme(stored) ? stored : isTheme(current) ? current : "light";
    applyTheme(next);
    setThemeState(next);
    setMounted(true);

    const syncTheme = (event: Event) => {
      const changed = (event as CustomEvent<unknown>).detail;
      if (isTheme(changed)) setThemeState(changed);
    };
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const changed = isTheme(event.newValue) ? event.newValue : "light";
      applyTheme(changed);
      setThemeState(changed);
    };

    document.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", syncStoredTheme);
    return () => {
      document.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", syncStoredTheme);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  }, []);

  return { theme, setTheme, mounted };
}

"use client";

import { useTheme, type Theme } from "@/hooks/artcovr/useTheme";

const SWATCH_RING = "shadow-[inset_0_0_0_0.05em_var(--foreground)]";
const THEMES: {
  id: Theme;
  name: string;
  label: string;
  bg: string;
  mark: string;
}[] = [
  {
    id: "light",
    name: "Light",
    label: "Switch to light theme",
    bg: "bg-cream",
    mark: "text-black",
  },
  {
    id: "dark",
    name: "Dark",
    label: "Switch to dark theme",
    bg: "bg-black",
    mark: "text-cream",
  },
  {
    id: "red",
    name: "Red",
    label: "Switch to red theme",
    bg: "bg-red",
    mark: "text-[#fff5dc]",
  },
];

export function ThemeSwitcher({
  id = "theme-switcher",
  placement = "corner",
}: {
  id?: string;
  placement?: "corner" | "menu";
}) {
  const { theme, setTheme, mounted } = useTheme();
  const menu = placement === "menu";

  return (
    <div
      id={id}
      className={
        menu
          ? "theme-control w-full md:hidden"
          : "theme-control fixed top-6 right-5 z-[3] hidden md:block"
      }
    >
      <div
        role="group"
        aria-label="Color theme"
        className={`flex gap-1 ${menu ? "w-full" : ""}`}
      >
        {THEMES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setTheme(candidate.id)}
            aria-label={candidate.label}
            aria-pressed={theme === candidate.id}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full transition-transform duration-200 ease-out hover:scale-105 ${menu ? "flex-1 border border-current/50 px-3" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full text-xs font-bold ${candidate.bg} ${candidate.mark} ${SWATCH_RING} ${theme === candidate.id ? "ring-2 ring-current ring-offset-2 ring-offset-[var(--background)]" : "opacity-90"}`}
            >
              {mounted && theme === candidate.id ? "✓" : null}
            </span>
            {menu ? <span className="text-xs font-bold uppercase tracking-[.08em]">{candidate.name}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

export function PageLayer({ active = false }: { active?: boolean }) {
  return (
    <div
      id="layer"
      className={`pointer-events-none fixed inset-0 z-[3] flex items-center justify-center bg-black text-white transition-[clip-path,visibility] duration-700 dark:bg-white dark:text-black ${
        active ? "visible [clip-path:inset(0)]" : "invisible [clip-path:inset(0_0_100%_0)]"
      }`}
      aria-hidden={!active}
    >
      <div className="text-4xl font-[900] tracking-[-0.07em]">ARTCOVR</div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";

type FacetKey = "genre" | "mood" | "color";
type ActiveView = Record<FacetKey, string | null>;

const TOTAL_COUNT = 187;

const GENRES = [
  ["Ambient", 118],
  ["Art Pop", 97],
  ["Electronic", 92],
  ["Indie Rock", 61],
  ["Jazz", 44],
  ["Classical", 36],
  ["Hip Hop", 29],
  ["Dream Pop", 23],
] as const;

const MOODS = [
  ["Serene", 78],
  ["Mysterious", 54],
  ["Vibrant", 41],
  ["Melancholic", 33],
  ["Majestic", 27],
  ["Eerie", 19],
] as const;

const COLORS = [
  ["Black", "#171717", 54],
  ["Blue", "#2f63c7", 37],
  ["Brown", "#8a5a3b", 21],
  ["Gray", "#8a8a86", 31],
  ["Green", "#3f754f", 28],
  ["Orange", "#df7a2e", 17],
  ["Pink", "#d88b9c", 14],
  ["Purple", "#7953a8", 26],
  ["Red", "#c84a3f", 23],
  ["Teal", "#319b95", 16],
  ["White", "#f5f1e7", 43],
  ["Yellow", "#dfb82e", 12],
] as const;

const INITIAL_VIEW: ActiveView = { genre: null, mood: null, color: null };

const FACETS: Record<FacetKey, {
  label: string;
  kicker: string;
  options: readonly (readonly [string, number])[];
}> = {
  genre: { label: "Genre", kicker: "Sound", options: GENRES },
  mood: { label: "Mood", kicker: "Atmosphere", options: MOODS },
  color: {
    label: "Color",
    kicker: "Palette",
    options: COLORS.map(([name, , count]) => [name, count] as const),
  },
};

function optionLabel(key: FacetKey, value: string) {
  return key === "color" ? value : value;
}

export function FilterDrawer() {
  const [view, setView] = useState<ActiveView>(INITIAL_VIEW);
  const [openFacet, setOpenFacet] = useState<FacetKey | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const activeFilterCount = Object.values(view).filter(Boolean).length;
  const resultCount = useMemo(() => {
    const selected = (Object.keys(view) as FacetKey[])
      .filter((key) => view[key])
      .map((key) => FACETS[key].options.find(([value]) => value === view[key])?.[1] ?? TOTAL_COUNT);
    if (!selected.length) return TOTAL_COUNT;
    if (selected.length === 1) return selected[0];
    return Math.max(6, Math.min(...selected) - (selected.length === 3 ? 11 : 7));
  }, [view]);

  useEffect(() => {
    if (!openFacet) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFacet(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFacet]);

  const clearAll = () => {
    setView(INITIAL_VIEW);
    setOpenFacet(null);
  };

  const selectValue = (key: FacetKey, value: string | null) => {
    setView((current) => ({ ...current, [key]: value }));
    setOpenFacet(null);
  };

  return (
    <main
      className="min-h-[100dvh] px-4 py-5 text-[#1d1d1b] sm:px-8 sm:py-10"
      style={{
        background: "#f5f1e7",
        fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div className="mx-auto w-full max-w-[980px]">
        <div className="mb-7 flex items-start justify-between gap-5 sm:mb-12">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[#a25b42]">
              Archive / discovery
            </p>
            <h1
              className="max-w-[480px] text-[clamp(2.35rem,7vw,5.1rem)] leading-[0.92] tracking-[-0.07em]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              Find your
              <br />
              cover.
            </h1>
          </div>
          <div className="hidden pt-8 text-right sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7c776d]">
              A living index
            </p>
            <p className="mt-1 text-sm text-[#4b4842]">187 published works</p>
          </div>
        </div>

        <section aria-label="Archive discovery controls">
          <div className="border-y border-[#282621]">
            <div className="flex min-h-[76px] items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 items-center gap-3 sm:gap-5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#a25b42] text-[13px] text-[#a25b42]"
                >
                  {activeFilterCount || "—"}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#7c776d]">
                    {activeFilterCount ? "Current lens" : "Start with a lens"}
                  </p>
                  <p className="truncate text-sm font-medium sm:text-base">
                    {activeFilterCount
                      ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} shaping the archive`
                      : "Three ways into 187 covers"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl leading-none tracking-[-0.06em] sm:text-3xl">{resultCount}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-[#7c776d]">
                  works shown
                </p>
              </div>
            </div>

            <div className="grid border-t border-[#d6d0c2] sm:grid-cols-3">
              {(Object.keys(FACETS) as FacetKey[]).map((key, index) => {
                const facet = FACETS[key];
                const selected = view[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOpenFacet(key)}
                    aria-haspopup="dialog"
                    aria-expanded={openFacet === key}
                    className={`group flex min-h-[96px] items-center justify-between gap-4 py-4 text-left outline-none transition-colors hover:bg-[#ebe4d5] focus-visible:bg-[#ebe4d5] sm:px-5 ${
                      index > 0 ? "border-t border-[#d6d0c2] sm:border-l sm:border-t-0" : ""
                    }`}
                  >
                    <span>
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.17em] text-[#a25b42]">
                        0{index + 1} / {facet.kicker}
                      </span>
                      <span className="block text-[17px] tracking-[-0.02em]">
                        {selected ? optionLabel(key, selected) : `Any ${facet.label.toLowerCase()}`}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#bcb5a7] text-lg leading-none transition-transform group-hover:translate-x-0.5"
                    >
                      +
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-[60px] items-center justify-between gap-4">
            <p className="text-xs leading-5 text-[#666158]" role="status" aria-live="polite">
              {activeFilterCount
                ? `${resultCount} ${resultCount === 1 ? "work" : "works"} match your selection.`
                : "Showing the full archive — no filters applied."}
            </p>
            {activeFilterCount ? (
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 border-b border-[#a25b42] pb-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-[#8f4b35] outline-none transition-colors hover:text-[#1d1d1b] focus-visible:ring-2 focus-visible:ring-[#a25b42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f1e7]"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </section>

        <p className="mt-12 max-w-[460px] text-xs leading-6 text-[#8a8478] sm:mt-20">
          Search by the feeling of a record before you remember its name. Open a lane to browse
          every available value.
        </p>
      </div>

      {openFacet ? (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#1d1d1b]/25 sm:items-stretch sm:justify-end">
          <button
            type="button"
            aria-label="Close filter panel"
            onClick={() => setOpenFacet(null)}
            className="absolute inset-0 cursor-default outline-none"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-drawer-title"
            className="relative z-10 max-h-[84dvh] w-full overflow-y-auto rounded-t-[24px] border border-[#d2cabc] bg-[#f8f4eb] px-5 pb-7 pt-4 shadow-[0_-12px_45px_rgba(46,38,26,0.14)] sm:max-h-none sm:w-[min(440px,100vw)] sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l sm:px-9 sm:pt-10 sm:shadow-[-16px_0_50px_rgba(46,38,26,0.12)]"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#c8c0b1] sm:hidden" />
            <div className="mb-8 flex items-start justify-between gap-4 border-b border-[#d6d0c2] pb-6">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a25b42]">
                  Filter / {FACETS[openFacet].kicker}
                </p>
                <h2 id="filter-drawer-title" className="text-3xl tracking-[-0.055em]">
                  Choose a {FACETS[openFacet].label.toLowerCase()}
                </h2>
                <p className="mt-2 text-xs text-[#777167]">One selection at a time.</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpenFacet(null)}
                aria-label="Close filter panel"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#bcb5a7] text-xl leading-none outline-none transition-colors hover:bg-[#ebe4d5] focus-visible:ring-2 focus-visible:ring-[#a25b42]"
              >
                ×
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                aria-pressed={view[openFacet] === null}
                onClick={() => selectValue(openFacet, null)}
                className={`flex w-full items-center justify-between border-b border-[#d6d0c2] py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#a25b42] focus-visible:ring-inset ${
                  view[openFacet] === null ? "text-[#a25b42]" : ""
                }`}
              >
                <span className="text-base">All {FACETS[openFacet].label.toLowerCase()}s</span>
                <span className="text-xs text-[#8a8478]">{TOTAL_COUNT} works</span>
              </button>
              {FACETS[openFacet].options.map(([value, count]) => {
                const colorValue = COLORS.find(([name]) => name === value)?.[1];
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view[openFacet] === value}
                    onClick={() => selectValue(openFacet, value)}
                    className={`flex w-full items-center justify-between border-b border-[#d6d0c2] py-4 text-left outline-none transition-colors hover:pl-2 hover:text-[#a25b42] focus-visible:ring-2 focus-visible:ring-[#a25b42] focus-visible:ring-inset ${
                      view[openFacet] === value ? "text-[#a25b42]" : ""
                    }`}
                  >
                    <span className="flex items-center gap-3 text-base">
                      {openFacet === "color" ? (
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 rounded-full border border-[#aaa294]"
                          style={{ background: colorValue }}
                        />
                      ) : null}
                      {value}
                    </span>
                    <span className="text-xs text-[#8a8478]">{count} works</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8478]">
              Selecting a value closes this panel
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
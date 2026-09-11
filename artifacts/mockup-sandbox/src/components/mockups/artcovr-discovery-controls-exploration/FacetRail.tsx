import { useMemo, useState } from "react";

type FacetKey = "genre" | "mood" | "color";

type Option = {
  value: string;
  label: string;
  count: number;
};

const TOTAL_COUNT = 187;

const GENRES: Option[] = [
  { value: "ambient", label: "Ambient", count: 118 },
  { value: "art-pop", label: "Art Pop", count: 160 },
  { value: "baroque-pop", label: "Baroque Pop", count: 7 },
  { value: "chamber-pop", label: "Chamber Pop", count: 23 },
  { value: "classical", label: "Classical", count: 31 },
  { value: "electronic", label: "Electronic", count: 92 },
  { value: "experimental", label: "Experimental", count: 47 },
  { value: "folk", label: "Folk", count: 28 },
];

const MOODS: Option[] = [
  { value: "serene", label: "Serene", count: 78 },
  { value: "mysterious", label: "Mysterious", count: 54 },
  { value: "vibrant", label: "Vibrant", count: 41 },
  { value: "melancholic", label: "Melancholic", count: 33 },
  { value: "majestic", label: "Majestic", count: 26 },
  { value: "eerie", label: "Eerie", count: 19 },
];

const COLORS = [
  ["Black", "#171717", 29],
  ["Blue", "#2f63c7", 21],
  ["Brown", "#8a5a3b", 13],
  ["Gray", "#8a8a86", 18],
  ["Green", "#3f754f", 14],
  ["Orange", "#df7a2e", 11],
  ["Pink", "#d88b9c", 12],
  ["Purple", "#7953a8", 16],
  ["Red", "#c84a3f", 15],
  ["Teal", "#319b95", 10],
  ["White", "#f5f1e7", 20],
  ["Yellow", "#dfb82e", 8],
] as const;

const FACET_LABELS: Record<FacetKey, string> = {
  genre: "Genre",
  mood: "Mood",
  color: "Color",
};

const FACET_NOTES: Record<FacetKey, string> = {
  genre: "Browse by the sound behind the cover.",
  mood: "Start with the feeling you want to find.",
  color: "Let the palette set the first note.",
};

const SWATCHES = Object.fromEntries(
  COLORS.map(([name, swatch]) => [name, swatch]),
) as Record<string, string>;

function getResultCount(
  view: Record<FacetKey, string>,
): number {
  const selected = Object.entries(view).filter(([, value]) => value);
  if (!selected.length) return TOTAL_COUNT;

  const values = selected.map(([facet, value]) => {
    const match = optionsFor(facet as FacetKey).find((option) => option.value === value);
    return match?.count ?? 0;
  });

  if (values.length === 1) return values[0];
  if (values.length === 2) return Math.max(3, Math.round(Math.min(...values) * 0.42));
  return Math.max(1, Math.round(Math.min(...values) * 0.22));
}

function optionsFor(facet: FacetKey): Option[] {
  if (facet === "genre") return GENRES;
  if (facet === "mood") return MOODS;
  return COLORS.map(([value, , count]) => ({ value, label: value, count }));
}

export function FacetRail() {
  const [view, setView] = useState<Record<FacetKey, string>>({
    genre: "",
    mood: "",
    color: "",
  });
  const [activeFacet, setActiveFacet] = useState<FacetKey>("genre");
  const resultCount = useMemo(() => getResultCount(view), [view]);
  const activeFilterCount = Object.values(view).filter(Boolean).length;
  const activeOption = optionsFor(activeFacet).find(
    (option) => option.value === view[activeFacet],
  );

  const choose = (facet: FacetKey, value: string) => {
    setView((current) => ({
      ...current,
      [facet]: current[facet] === value ? "" : value,
    }));
  };

  const clearAll = () => {
    setView({ genre: "", mood: "", color: "" });
  };

  return (
    <main
      className="min-h-[100dvh] w-full px-4 py-5 sm:px-8 sm:py-8 lg:px-12"
      style={{
        background: "#f3eedf",
        color: "#20231f",
        fontFamily: '"DM Sans", "Avenir Next", sans-serif',
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <style>{`
        .facet-rail-focus:focus-visible {
          outline: 3px solid #d85f42;
          outline-offset: 4px;
        }
        .facet-option {
          transition: transform 180ms ease, opacity 180ms ease, background-color 180ms ease;
        }
        .facet-option:hover { transform: translateX(4px); }
        .facet-option[data-active="true"] { transform: translateX(8px); }
        @media (prefers-reduced-motion: reduce) {
          .facet-option { transition: none; }
          .facet-option:hover, .facet-option[data-active="true"] { transform: none; }
        }
      `}</style>

      <div className="mx-auto max-w-[1180px]">
        <header className="mb-7 flex items-end justify-between gap-6 border-b border-[#20231f]/20 pb-5 sm:mb-9 sm:pb-6">
          <div>
            <p
              className="mb-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#d85f42]"
              style={{ fontFamily: "SFMono-Regular, Consolas, monospace" }}
            >
              ARTCOVR / discovery index
            </p>
            <h1
              className="text-[clamp(2rem,5vw,4.15rem)] leading-[0.92] tracking-[-0.075em]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Find your cover.
            </h1>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#20231f]/50">
              Archive size
            </p>
            <p
              className="text-4xl leading-none tracking-[-0.08em]"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              187
            </p>
          </div>
        </header>

        <p className="mb-7 max-w-[620px] text-sm leading-6 text-[#20231f]/65 sm:mb-10 sm:text-[15px]">
          Three ways into a living index of artwork. Choose one lane, then
          follow the thread.
        </p>

        <section
          aria-label="Artwork archive filters"
          className="grid overflow-hidden border border-[#20231f]/25 bg-[#eae2d1] lg:grid-cols-[248px_minmax(0,1fr)]"
        >
          <nav
            aria-label="Filter facets"
            className="border-b border-[#20231f]/20 bg-[#ded4c1] p-4 lg:border-b-0 lg:border-r lg:p-6"
          >
            <div className="mb-5 flex items-center justify-between lg:mb-12 lg:block">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#20231f]/55">
                  Filter by
                </p>
                <p
                  className="mt-1 text-lg tracking-[-0.04em]"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  Select a lane
                </p>
              </div>
              <span
                className="text-xs text-[#20231f]/55 lg:mt-3 lg:block"
                aria-hidden="true"
              >
                {String(activeFilterCount).padStart(2, "0")} / 03 active
              </span>
            </div>

            <ol className="grid grid-cols-3 gap-2 lg:block lg:space-y-2">
              {(Object.keys(FACET_LABELS) as FacetKey[]).map((facet, index) => {
                const selected = Boolean(view[facet]);
                const active = facet === activeFacet;
                return (
                  <li key={facet}>
                    <button
                      type="button"
                      className="facet-rail-focus group flex w-full items-center gap-2 text-left lg:gap-4"
                      aria-current={active ? "step" : undefined}
                      onClick={() => setActiveFacet(facet)}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center border text-[11px] font-bold transition-colors duration-200 lg:h-10 lg:w-10"
                        style={{
                          borderColor: active ? "#d85f42" : "#20231f33",
                          background: active ? "#d85f42" : "transparent",
                          color: active ? "#f3eedf" : "#20231f99",
                        }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span
                          className="block truncate text-xs font-bold uppercase tracking-[0.12em] lg:text-sm"
                          style={{ color: active ? "#20231f" : "#20231f99" }}
                        >
                          {FACET_LABELS[facet]}
                        </span>
                        <span className="mt-1 hidden text-xs text-[#20231f]/55 lg:block">
                          {selected
                            ? optionsFor(facet).find((item) => item.value === view[facet])?.label
                            : "All works"}
                        </span>
                      </span>
                      {selected ? (
                        <span
                          className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#d85f42] lg:block"
                          aria-label={`${FACET_LABELS[facet]} filter active`}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-7 hidden border-t border-[#20231f]/15 pt-5 lg:block">
              <p className="text-xs leading-5 text-[#20231f]/60">
                The archive stays intact while you filter. Nothing is hidden;
                you are only changing the view.
              </p>
            </div>
          </nav>

          <div className="min-w-0 p-5 sm:p-8 lg:p-10">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-5 border-b border-[#20231f]/15 pb-6">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#d85f42]">
                  0{Object.keys(FACET_LABELS).indexOf(activeFacet) + 1} /{" "}
                  {FACET_LABELS[activeFacet]}
                </p>
                <h2
                  className="text-[clamp(1.7rem,3vw,2.65rem)] leading-none tracking-[-0.065em]"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  {FACET_NOTES[activeFacet]}
                </h2>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#20231f]/50">
                  Current view
                </p>
                <p
                  className="mt-1 text-3xl leading-none tracking-[-0.08em]"
                  style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  {resultCount}
                  <span className="ml-1 text-sm tracking-normal text-[#20231f]/55">
                    works
                  </span>
                </p>
              </div>
            </div>

            <div
              className="grid gap-x-8 gap-y-1 sm:grid-cols-2"
              role="group"
              aria-label={`${FACET_LABELS[activeFacet]} options`}
            >
              <button
                type="button"
                className="facet-option facet-rail-focus group flex min-h-12 items-center justify-between border-b border-[#20231f]/15 py-3 text-left"
                aria-pressed={!view[activeFacet]}
                data-active={!view[activeFacet]}
                onClick={() => choose(activeFacet, "")}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: !view[activeFacet] ? "#d85f42" : "#20231f" }}
                >
                  All {FACET_LABELS[activeFacet].toLowerCase()}s
                </span>
                <span className="text-xs tabular-nums text-[#20231f]/45">
                  {TOTAL_COUNT}
                </span>
              </button>

              {optionsFor(activeFacet).map((option) => {
                const selected = view[activeFacet] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="facet-option facet-rail-focus group flex min-h-12 items-center justify-between border-b border-[#20231f]/15 py-3 text-left"
                    aria-pressed={selected}
                    data-active={selected}
                    onClick={() => choose(activeFacet, option.value)}
                  >
                    <span className="flex items-center gap-3">
                      {activeFacet === "color" ? (
                        <span
                          aria-hidden="true"
                          className="h-5 w-5 rounded-full border border-[#20231f]/25"
                          style={{ background: SWATCHES[option.value] }}
                        />
                      ) : null}
                      <span
                        className="text-sm"
                        style={{
                          fontWeight: selected ? 700 : 500,
                          color: selected ? "#d85f42" : "#20231f",
                        }}
                      >
                        {option.label}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-[#20231f]/45">
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs leading-5 text-[#20231f]/60">
                {activeOption
                  ? `${activeOption.label} selected · ${activeOption.count} works in the index`
                  : "No restriction on this lane · showing every work"}
              </p>
              <button
                type="button"
                className="facet-rail-focus border-b border-[#d85f42] pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#d85f42] disabled:cursor-not-allowed disabled:border-[#20231f]/20 disabled:text-[#20231f]/35"
                onClick={clearAll}
                disabled={!activeFilterCount}
              >
                Clear all filters
              </button>
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p
            className="text-[10px] uppercase tracking-[0.16em] text-[#20231f]/50"
            role="status"
            aria-live="polite"
          >
            {activeFilterCount
              ? `${resultCount} of ${TOTAL_COUNT} works shown · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active`
              : `Showing the full archive · ${TOTAL_COUNT} works`}
          </p>
          <span className="hidden text-[10px] uppercase tracking-[0.16em] text-[#20231f]/35 sm:block">
            Use the numbered rail to change lanes
          </span>
        </div>
      </div>
    </main>
  );
}
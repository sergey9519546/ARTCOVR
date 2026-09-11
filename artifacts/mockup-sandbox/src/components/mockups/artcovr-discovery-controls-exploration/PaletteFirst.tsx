import { useMemo, useState } from "react";

const COLORS = [
  ["Black", "#171717", 28],
  ["Blue", "#2f63c7", 18],
  ["Brown", "#8a5a3b", 12],
  ["Gray", "#8a8a86", 14],
  ["Green", "#3f754f", 13],
  ["Orange", "#df7a2e", 9],
  ["Pink", "#d88b9c", 11],
  ["Purple", "#7953a8", 16],
  ["Red", "#c84a3f", 15],
  ["Teal", "#319b95", 17],
  ["White", "#f5f1e7", 10],
  ["Yellow", "#dfb82e", 14],
] as const;

const GENRES = [
  ["Art Pop", 160],
  ["Ambient", 118],
  ["Electronic", 92],
  ["Chamber Pop", 23],
  ["Baroque Pop", 7],
] as const;

const MOODS = [
  ["Serene", 78],
  ["Mysterious", 54],
  ["Vibrant", 41],
  ["Melancholic", 33],
  ["Majestic", 29],
  ["Eerie", 19],
] as const;

const genreFactor: Record<string, number> = {
  "Art Pop": 0.86,
  Ambient: 0.63,
  Electronic: 0.49,
  "Chamber Pop": 0.28,
  "Baroque Pop": 0.17,
};

const moodFactor: Record<string, number> = {
  Serene: 0.58,
  Mysterious: 0.47,
  Vibrant: 0.39,
  Melancholic: 0.32,
  Majestic: 0.26,
  Eerie: 0.2,
};

export function PaletteFirst() {
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [color, setColor] = useState("");

  const activeFilterCount = [genre, mood, color].filter(Boolean).length;
  const resultCount = useMemo(() => {
    if (!activeFilterCount) return 187;
    const colorCount = COLORS.find(([name]) => name === color)?.[2] ?? 187;
    const startingCount = color ? colorCount : 187;
    const narrowed = startingCount
      * (genre ? (genreFactor[genre] ?? 0.5) : 1)
      * (mood ? (moodFactor[mood] ?? 0.45) : 1);
    return Math.max(1, Math.round(narrowed));
  }, [activeFilterCount, color, genre, mood]);

  const clearAll = () => {
    setGenre("");
    setMood("");
    setColor("");
  };

  return (
    <main
      aria-label="ARTCOVR palette-first archive filters"
      className="min-h-[100dvh] overflow-hidden px-5 py-7 text-[#171717] sm:px-9 sm:py-10 lg:px-16"
      style={{
        backgroundColor: "#f5f1e7",
        backgroundImage:
          "linear-gradient(rgba(23,23,23,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(23,23,23,.035) 1px, transparent 1px)",
        backgroundSize: "100% 42px, 42px 100%",
        fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1160px]">
        <header className="border-b border-[#171717]/80 pb-6 sm:pb-8">
          <div className="flex items-start justify-between gap-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#171717]/60">
              ARTCOVR / visual index
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#171717]/55">
              archive no. 04
            </p>
          </div>

          <div className="mt-10 grid gap-7 sm:mt-14 sm:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] sm:items-end sm:gap-10">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#c84a3f]">
                Browse by palette
              </p>
              <div className="mt-2 flex items-end gap-4">
                <span
                  className="text-[clamp(5.5rem,18vw,12rem)] font-black leading-[.74] tracking-[-0.095em]"
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {resultCount}
                </span>
                <span className="mb-1 max-w-[130px] border-l border-[#171717]/50 pl-3 text-xs leading-[1.35] text-[#171717]/65 sm:mb-2">
                  covers in the
                  <br />
                  current view
                </span>
              </div>
            </div>
            <p className="max-w-[330px] text-[15px] leading-[1.45] text-[#171717]/72">
              Start with a color, then sharpen the signal with sound and atmosphere. The full archive stays close at hand.
            </p>
          </div>
        </header>

        <section className="pt-8 sm:pt-10" aria-labelledby="palette-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#171717]/55">01 / primary index</p>
              <h1 id="palette-heading" className="mt-2 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                Choose a palette
              </h1>
            </div>
            {color ? (
              <button
                type="button"
                onClick={() => setColor("")}
                className="shrink-0 border-b border-[#c84a3f] pb-1 text-xs font-bold uppercase tracking-[0.12em] text-[#c84a3f] outline-none transition-opacity hover:opacity-65 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#c84a3f] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f5f1e7]"
              >
                Clear color
              </button>
            ) : null}
          </div>

          <div
            className="mt-6 grid grid-cols-6 gap-1.5 sm:grid-cols-12 sm:gap-2"
            role="group"
            aria-label="Color palette"
          >
            {COLORS.map(([name, swatch, count]) => {
              const selected = color === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={`${name}, ${count} works`}
                  aria-pressed={selected}
                  title={`${name} · ${count} works`}
                  onClick={() => setColor(selected ? "" : name)}
                  className="group relative aspect-[.72] min-h-[58px] border border-[#171717]/15 outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#c84a3f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f5f1e7] sm:aspect-[.82] sm:min-h-[78px]"
                  style={{
                    backgroundColor: swatch,
                    boxShadow: selected ? "inset 0 0 0 3px #f5f1e7, inset 0 0 0 5px #171717" : undefined,
                  }}
                >
                  <span
                    className="absolute inset-x-0 bottom-0 translate-y-full pt-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ color: "#171717" }}
                  >
                    {name}
                  </span>
                  {selected ? (
                    <span className="absolute inset-x-0 top-1 text-center font-mono text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: name === "Black" || name === "Blue" || name === "Purple" ? "#f5f1e7" : "#171717" }}>
                      selected
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-5 min-h-5 font-mono text-[11px] uppercase tracking-[0.13em] text-[#171717]/58">
            {color ? `${color} / ${COLORS.find(([name]) => name === color)?.[2]} works indexed` : "12 indexed colors / select one to begin"}
          </p>
        </section>

        <section className="mt-9 border-t border-[#171717]/80 pt-6 sm:mt-12 sm:pt-8" aria-labelledby="refine-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#171717]/55">02 / secondary index</p>
              <h2 id="refine-heading" className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Refine the atmosphere</h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#171717]/55">one selection per lane</span>
          </div>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="group flex min-h-[74px] flex-col justify-between border border-[#171717]/35 bg-[#ebe4d8]/75 p-4 transition-colors focus-within:border-[#c84a3f]">
              <span className="flex items-center justify-between gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                Music genre
                <span className="text-[#171717]/45">A—Z</span>
              </span>
              <select
                aria-label="Music genre"
                value={genre}
                onChange={(event) => setGenre(event.target.value)}
                className="mt-2 w-full cursor-pointer appearance-none bg-transparent pr-6 text-sm font-semibold outline-none"
                style={{ backgroundImage: "linear-gradient(45deg, transparent 50%, #c84a3f 50%), linear-gradient(135deg, #c84a3f 50%, transparent 50%)", backgroundPosition: "calc(100% - 9px) 52%, calc(100% - 4px) 52%", backgroundSize: "5px 5px, 5px 5px", backgroundRepeat: "no-repeat" }}
              >
                <option value="">All music genres · 187 works</option>
                {GENRES.map(([name, count]) => <option key={name} value={name}>{name} · {count} works</option>)}
              </select>
            </label>

            <label className="group flex min-h-[74px] flex-col justify-between border border-[#171717]/35 bg-[#ebe4d8]/75 p-4 transition-colors focus-within:border-[#c84a3f]">
              <span className="flex items-center justify-between gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
                Mood
                <span className="text-[#171717]/45">A—Z</span>
              </span>
              <select
                aria-label="Mood"
                value={mood}
                onChange={(event) => setMood(event.target.value)}
                className="mt-2 w-full cursor-pointer appearance-none bg-transparent pr-6 text-sm font-semibold outline-none"
                style={{ backgroundImage: "linear-gradient(45deg, transparent 50%, #c84a3f 50%), linear-gradient(135deg, #c84a3f 50%, transparent 50%)", backgroundPosition: "calc(100% - 9px) 52%, calc(100% - 4px) 52%", backgroundSize: "5px 5px, 5px 5px", backgroundRepeat: "no-repeat" }}
              >
                <option value="">All moods · 187 works</option>
                {MOODS.map(([name, count]) => <option key={name} value={name}>{name} · {count} works</option>)}
              </select>
            </label>
          </div>
        </section>

        <footer className="mt-8 flex flex-col gap-5 border-t border-[#171717]/35 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" aria-live="polite" className="text-sm font-medium">
            {activeFilterCount ? (
              <><span className="mr-2 inline-block h-2 w-2 rounded-full bg-[#c84a3f] align-[1px]" aria-hidden="true" />{activeFilterCount} {activeFilterCount === 1 ? "filter" : "filters"} active · {resultCount} {resultCount === 1 ? "work" : "works"} shown</>
            ) : (
              "Showing the full archive · 187 works"
            )}
          </p>
          {activeFilterCount ? (
            <button
              type="button"
              onClick={clearAll}
              className="self-start border-b border-[#171717] pb-1 text-xs font-bold uppercase tracking-[0.14em] outline-none transition-colors hover:border-[#c84a3f] hover:text-[#c84a3f] focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#c84a3f] focus-visible:ring-offset-4 focus-visible:ring-offset-[#f5f1e7] sm:self-auto"
            >
              Clear all filters
            </button>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
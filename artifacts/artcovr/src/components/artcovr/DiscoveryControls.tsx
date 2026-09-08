import { displayGenreLabel } from "@/lib/artcovr/artworks";
import type { CatalogFacetIndex } from "@/lib/artcovr/catalog-intelligence";
import { displayFacetLabel, displayMoodLabel, type CatalogView } from "./CatalogControls";

const SWATCHES: Record<string, string> = { Black: "#171717", Blue: "#2f63c7", Brown: "#8a5a3b", Gray: "#8a8a86", Green: "#3f754f", Orange: "#df7a2e", Pink: "#d88b9c", Purple: "#7953a8", Red: "#c84a3f", Teal: "#319b95", White: "#f5f1e7", Yellow: "#dfb82e" };

/** Every available lane stays reachable; options never randomly disappear. */
export function DiscoveryControls({ view, onChange, index, resultCount, totalCount }: {
  view: CatalogView;
  onChange: (view: CatalogView) => void;
  index: CatalogFacetIndex;
  resultCount: number;
  totalCount: number;
}) {
  return <div data-catalog-controls className="discovery-filters">
    <p className="sr-only" role="status" aria-live="polite">{resultCount} / {totalCount} works</p>
    {(["genre", "mood"] as const).map((key) => {
      const label = key === "genre" ? "Music genre" : "Mood";
      const display = key === "genre" ? displayGenreLabel : displayMoodLabel;
      const options = [...index.counts[key]].sort(([a], [b]) => display(a).localeCompare(display(b)));
      return <label key={key} data-facet={key} className="discovery-select-label">
        <span>{label}</span>
        <select value={view[key] ?? ""} onChange={(event) => onChange({ ...view, [key]: event.target.value || null })}>
          <option value="">{key === "genre" ? "All music genres" : "All moods"}</option>
          {view[key] && !index.counts[key].has(view[key]!) ? <option value={view[key]!}>{display(view[key]!)} · 0</option> : null}
          {options.map(([value, count]) => <option key={value} value={value}>{display(value)} · {count}</option>)}
        </select>
      </label>;
    })}
    <fieldset data-facet="color" className="min-w-0">
      <legend className="discovery-label">Color</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="discovery-color" aria-pressed={!view.color} onClick={() => onChange({ ...view, color: null })}>All</button>
        {[...index.counts.color.keys()].sort().map((color) => <button key={color} type="button" className="discovery-color" aria-label={`Color: ${color}`} title={color} aria-pressed={view.color === color} onClick={() => onChange({ ...view, color })}>
          <span aria-hidden="true" className="h-4 w-4 rounded-full border border-current/20" style={{ background: SWATCHES[color] ?? (color.startsWith("#") ? color : undefined) }} />
          <span className={view.color === color ? "text-xs capitalize" : "sr-only"}>{displayFacetLabel(color)}</span>
        </button>)}
      </div>
    </fieldset>
  </div>;
}

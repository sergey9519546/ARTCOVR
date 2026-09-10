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
  const activeFilterCount = [view.genre, view.mood, view.color].filter(Boolean).length;

  return <div data-catalog-controls className="discovery-editorial-filters">
    <p className="sr-only" role="status" aria-live="polite">{resultCount} / {totalCount} works</p>
    <div className="discovery-editorial-filter-panel" aria-label="Artwork archive filters">
      {(["genre", "mood"] as const).map((key) => {
        const label = key === "genre" ? "Music genre" : "Mood";
        const display = key === "genre" ? displayGenreLabel : displayMoodLabel;
        const allLabel = key === "genre" ? "All music genres" : "All moods";
        const options = [...index.counts[key]].sort(([a], [b]) => display(a).localeCompare(display(b)));
        return <div key={key} data-facet={key} className="discovery-editorial-filter-row">
          <h2 className="discovery-editorial-facet-label">{label}</h2>
          <label className="discovery-editorial-select-wrap">
            <span className="sr-only">{label}</span>
            <select aria-label={label} value={view[key] ?? ""} onChange={(event) => onChange({ ...view, [key]: event.target.value || null })}>
              <option value="">{allLabel} · {totalCount} works</option>
              {view[key] && !index.counts[key].has(view[key]!) ? <option value={view[key]!}>{display(view[key]!)} · 0 works</option> : null}
              {options.map(([value, count]) => <option key={value} value={value}>{display(value)} · {count} works</option>)}
            </select>
          </label>
        </div>;
      })}
      <div data-facet="color" className="discovery-editorial-filter-row">
        <h2 className="discovery-editorial-facet-label">Color</h2>
        <div className="discovery-editorial-color-options" role="group" aria-label="Color">
          <button type="button" className="discovery-editorial-color" aria-pressed={!view.color} onClick={() => onChange({ ...view, color: null })}>
            <span className="discovery-editorial-color-all">All</span>
          </button>
          {[...index.counts.color.keys()].sort().map((color) => <button key={color} type="button" className="discovery-editorial-color" aria-label={`Color: ${displayFacetLabel(color)}`} title={displayFacetLabel(color)} aria-pressed={view.color === color} onClick={() => onChange({ ...view, color })}>
            <span aria-hidden="true" className="discovery-editorial-swatch" style={{ background: SWATCHES[color] ?? (color.startsWith("#") ? color : undefined) }} />
          </button>)}
        </div>
      </div>
    </div>
    <div className="discovery-editorial-filter-status">
      <span>{activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active · ${resultCount} ${resultCount === 1 ? "work" : "works"} shown` : "Showing the full archive"}</span>
    </div>
  </div>;
}

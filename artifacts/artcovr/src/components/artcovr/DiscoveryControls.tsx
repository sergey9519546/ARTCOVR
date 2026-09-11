import { displayGenreLabel } from "@/lib/artcovr/artworks";
import type { CatalogFacetIndex } from "@/lib/artcovr/catalog-intelligence";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { displayFacetLabel, displayMoodLabel, type CatalogView } from "./CatalogControls";

const SWATCHES: Record<string, string> = { Black: "#171717", Blue: "#2f63c7", Brown: "#8a5a3b", Gray: "#8a8a86", Green: "#3f754f", Orange: "#df7a2e", Pink: "#d88b9c", Purple: "#7953a8", Red: "#c84a3f", Teal: "#319b95", White: "#f5f1e7", Yellow: "#dfb82e" };
const ALL_FACET_VALUE = "__all__";

function displayColorLabel(value: string) {
  return displayFacetLabel(value).replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Every available lane stays reachable; options never randomly disappear. */
export function DiscoveryControls({ view, onChange, index, resultCount, totalCount }: {
  view: CatalogView;
  onChange: (view: CatalogView) => void;
  index: CatalogFacetIndex;
  resultCount: number;
  totalCount: number;
}) {
  const activeFilterCount = [view.genre, view.mood, view.color].filter(Boolean).length;
  const colors = [...index.counts.color.keys()].sort();
  const genreOptions = [...index.counts.genre].sort(([a], [b]) => displayGenreLabel(a).localeCompare(displayGenreLabel(b)));
  const moodOptions = [...index.counts.mood].sort(([a], [b]) => displayMoodLabel(a).localeCompare(displayMoodLabel(b)));
  const update = (key: keyof CatalogView, value: string | null) => onChange({ ...view, [key]: value });
  const clearAll = () => onChange({ genre: null, mood: null, color: null });

  return <section data-catalog-controls className="discovery-palette-filters" aria-label="Archive filters">
    <p className="sr-only" role="status" aria-live="polite">{resultCount} / {totalCount} works</p>
    <div className="discovery-palette-primary">
      <div className="discovery-palette-section-head">
        <div>
          <p className="discovery-palette-index-label">01 / primary index</p>
        </div>
        {view.color ? <button type="button" className="discovery-palette-clear-inline" onClick={() => update("color", null)}>Clear color</button> : null}
      </div>
      <div data-facet="color" className="discovery-palette-swatches" role="group" aria-label="Color palette">
        <button type="button" className="discovery-palette-swatch discovery-palette-all" aria-label="All" title={`All colors · ${totalCount} works`} aria-pressed={!view.color} onClick={() => update("color", null)}>
          <span>All</span>
        </button>
        {colors.map((color) => (
          <button key={color} type="button" className="discovery-palette-swatch" aria-label={`Color: ${displayColorLabel(color)}`} title={`${displayColorLabel(color)} · ${index.counts.color.get(color)} works`} aria-pressed={view.color === color} onClick={() => update("color", color)} style={{ backgroundColor: SWATCHES[color] ?? (color.startsWith("#") ? color : undefined) }}>
            {view.color === color ? <span className="discovery-palette-selected">selected</span> : null}
          </button>
        ))}
      </div>
      <p className="discovery-palette-meta">
        {view.color ? `${displayFacetLabel(view.color)} / ${index.counts.color.get(view.color) ?? 0} works indexed` : `${colors.length} indexed colors / select one to begin`}
      </p>
    </div>

    <div className="discovery-palette-secondary">
      <div className="discovery-palette-section-head">
        <div>
          <p className="discovery-palette-index-label">02 / secondary index</p>
        </div>
        <span className="discovery-palette-one-per-lane">one selection per lane</span>
      </div>
      <div className="discovery-palette-select-grid">
        {[
          { key: "genre" as const, label: "Music genre", options: genreOptions, display: displayGenreLabel, all: "All music genres" },
          { key: "mood" as const, label: "Mood", options: moodOptions, display: displayMoodLabel, all: "All moods" },
        ].map(({ key, label, options, display, all }) => {
          const labelId = `discovery-palette-${key}-label`;
          const unknownValue = view[key] && !index.counts[key].has(view[key]!) ? view[key]! : null;
          return (
          <div key={key} data-facet={key} className="discovery-palette-select-card">
            <span id={labelId} className="discovery-palette-select-label">
              {label}
              <span aria-hidden="true">A—Z</span>
            </span>
            <span className="discovery-palette-select-wrap">
              <Select
                value={view[key] ?? ALL_FACET_VALUE}
                onValueChange={(value) => update(key, value === ALL_FACET_VALUE ? null : value)}
              >
                <SelectTrigger
                  aria-label={label}
                  aria-labelledby={labelId}
                  className="discovery-palette-select-trigger"
                >
                  <SelectValue placeholder={all} />
                </SelectTrigger>
                <SelectContent className="discovery-palette-select-content">
                  <SelectItem value={ALL_FACET_VALUE}>
                    {all} <span className="discovery-palette-option-count">· {totalCount} works</span>
                  </SelectItem>
                  {unknownValue ? (
                    <SelectItem value={unknownValue}>
                      {display(unknownValue)} <span className="discovery-palette-option-count">· 0 works</span>
                    </SelectItem>
                  ) : null}
                  {options.map(([value, count]) => (
                    <SelectItem key={value} value={value}>
                      {display(value)} <span className="discovery-palette-option-count">· {count} works</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </div>
        );})}
      </div>
    </div>

    <footer className="discovery-palette-footer">
      <p>
        <span aria-hidden="true" />
        {activeFilterCount ? `${activeFilterCount} ${activeFilterCount === 1 ? "filter" : "filters"} active · ${resultCount} ${resultCount === 1 ? "work" : "works"} shown` : `Showing the full archive · ${totalCount} works`}
      </p>
      {activeFilterCount ? <button type="button" onClick={clearAll}>Clear all filters</button> : null}
    </footer>
  </section>;
}

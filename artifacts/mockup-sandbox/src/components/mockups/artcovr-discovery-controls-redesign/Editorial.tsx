import "./_group.css";
import { useState } from "react";

const colors = [
  ["Black", "#171717"],
  ["Blue", "#2f63c7"],
  ["Brown", "#8a5a3b"],
  ["Gray", "#8a8a86"],
  ["Green", "#3f754f"],
  ["Orange", "#df7a2e"],
  ["Pink", "#d88b9c"],
  ["Purple", "#7953a8"],
  ["Red", "#c84a3f"],
  ["Teal", "#319b95"],
  ["White", "#f5f1e7"],
  ["Yellow", "#dfb82e"],
] as const;

export function Editorial() {
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [color, setColor] = useState("");
  const hasFilter = Boolean(genre || mood || color);

  const clearAll = () => {
    setGenre("");
    setMood("");
    setColor("");
  };

  return (
    <main className="discovery-preview discovery-editorial">
      <header className="editorial-header">
        <div>
          <p className="eyebrow">Archive / live index</p>
          <div className="count-line">
            <span className="count" aria-hidden="true">187</span>
            <span className="count-caption">published works<br />ready to browse</span>
          </div>
          <p className="sr-only" role="status" aria-live="polite">187 / 187 works</p>
        </div>
        <p className="intro">Find a visual starting point by sound, atmosphere, or palette. Every lane stays open; nothing is hidden behind a rotating shortlist.</p>
      </header>

      <section className="filter-panel" aria-label="Artwork archive filters">
        <div className="filter-row">
          <h2 className="facet-label">Music genre</h2>
          <label className="select-wrap">
            <span className="sr-only">Music genre</span>
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="">All music genres · 187 works</option>
              <option>Ambient · 118</option>
              <option>Art Pop · 160</option>
              <option>Baroque Pop · 7</option>
              <option>Chamber Pop · 23</option>
              <option>Electronic · 92</option>
            </select>
          </label>
        </div>

        <div className="filter-row">
          <h2 className="facet-label">Mood</h2>
          <label className="select-wrap">
            <span className="sr-only">Mood</span>
            <select value={mood} onChange={(event) => setMood(event.target.value)}>
              <option value="">All moods · 187 works</option>
              <option>Serene · 78</option>
              <option>Mysterious · 54</option>
              <option>Vibrant · 41</option>
              <option>Melancholic · 33</option>
            </select>
          </label>
        </div>

        <div className="filter-row">
          <h2 className="facet-label">Color</h2>
          <div className="color-options">
            {colors.map(([name, value]) => (
              <button key={name} type="button" className="color-button" title={name} aria-label={`Color: ${name}`} aria-pressed={color === name} onClick={() => setColor(color === name ? "" : name)}>
                <span className="swatch" aria-hidden="true" style={{ background: value }} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer-row">
        <span className="active-state">{hasFilter ? "1 filter active" : "Showing the full archive"}</span>
        {hasFilter ? <button type="button" className="clear-button" onClick={clearAll}>Clear all</button> : null}
      </footer>
    </main>
  );
}
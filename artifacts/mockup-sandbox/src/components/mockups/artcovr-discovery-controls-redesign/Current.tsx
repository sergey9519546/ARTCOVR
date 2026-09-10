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

export function Current() {
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [color, setColor] = useState("");

  return (
    <main className="discovery-preview discovery-current">
      <p className="current-label">Current discovery controls</p>
      <p className="sr-only" role="status" aria-live="polite">187 / 187 works</p>
      <div className="discovery-filters">
        <label className="discovery-select-label">
          <span>Music genre</span>
          <select value={genre} onChange={(event) => setGenre(event.target.value)}>
            <option value="">All music genres</option>
            <option>Ambient · 118</option>
            <option>Art Pop · 160</option>
            <option>Baroque Pop · 7</option>
            <option>Chamber Pop · 23</option>
            <option>Electronic · 92</option>
          </select>
        </label>
        <label className="discovery-select-label">
          <span>Mood</span>
          <select value={mood} onChange={(event) => setMood(event.target.value)}>
            <option value="">All moods</option>
            <option>Serene · 78</option>
            <option>Mysterious · 54</option>
            <option>Vibrant · 41</option>
            <option>Melancholic · 33</option>
          </select>
        </label>
        <fieldset>
          <legend className="discovery-label">Color</legend>
          <div className="color-list">
            <button type="button" className="color-button" aria-pressed={!color} onClick={() => setColor("")}>All</button>
            {colors.map(([name, value]) => (
              <button key={name} type="button" className="color-button" title={name} aria-label={`Color: ${name}`} aria-pressed={color === name} onClick={() => setColor(name)}>
                <span className="swatch" aria-hidden="true" style={{ background: value }} />
                {color === name ? <span>{name}</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </main>
  );
}
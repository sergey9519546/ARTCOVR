import { useEffect, useMemo, useState } from "react";
import "./_group.css";

type FacetKey = "style" | "color" | "mood";

type Facet = {
  key: FacetKey;
  label: string;
  options: string[];
  visibleCount: number;
  swatches?: Record<string, string>;
};

const FACETS: Facet[] = [
  {
    key: "style",
    label: "Style",
    visibleCount: 3,
    options: [
      "Digital / Computational",
      "Graphic / Illustration",
      "Material / Sculptural",
      "Minimal / Abstract",
      "Mixed Media / Collage",
      "Painterly / Illustrative",
      "Surreal / Hybrid",
    ],
  },
  {
    key: "color",
    label: "Color",
    visibleCount: 8,
    options: [
      "Black",
      "Blue",
      "Gray",
      "Green",
      "Orange",
      "Purple",
      "Red",
      "White",
      "Yellow",
      "Ochre",
      "Teal",
      "Pink",
      "Beige",
      "Multicolor",
      "Navy",
      "Coral",
      "Cyan",
      "Lime",
      "Lavender",
      "Burgundy",
      "Silver",
      "Clay",
    ],
    swatches: {
      Black: "#171717",
      Blue: "#2d63bd",
      Gray: "#8a8a86",
      Green: "#4e7c59",
      Orange: "#dc6c2b",
      Purple: "#7952a4",
      Red: "#bf4b42",
      White: "#f5f1e7",
      Yellow: "#d6ad25",
      Ochre: "#a88339",
      Teal: "#248c83",
      Pink: "#d77787",
      Beige: "#cdbb98",
      Multicolor: "linear-gradient(90deg, #dc6c2b 33%, #2d63bd 33% 66%, #4e7c59 66%)",
      Navy: "#243b67",
      Coral: "#ef765f",
      Cyan: "#40b6c4",
      Lime: "#93ad38",
      Lavender: "#9a8fc3",
      Burgundy: "#71323f",
      Silver: "#b9b9b2",
      Clay: "#a9674e",
    },
  },
  {
    key: "mood",
    label: "Mood",
    visibleCount: 8,
    options: [
      "Graphic",
      "Dreamlike",
      "Surreal",
      "Quiet",
      "Monumental",
      "Solitary",
      "Minimal",
      "Nocturnal",
      "Architectural",
      "Uncanny",
      "Kinetic",
      "Macabre",
      "Electric",
      "Tender",
      "Tense",
      "Celestial",
      "Nostalgic",
    ],
  },
];

const ROTATION_MS = 4400;

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function visibleOptions(options: string[], active: string | null, offset: number, visibleCount: number) {
  const available = active ? options.filter((option) => option !== active) : options;
  const count = active ? visibleCount - 1 : visibleCount;
  const start = offset % available.length;
  const rotating = Array.from({ length: Math.min(count, available.length) }, (_, index) => (
    available[(start + index) % available.length]
  ));
  return active ? [active, ...rotating].slice(0, visibleCount) : rotating;
}

export function FacetOrbit() {
  const [active, setActive] = useState<Record<FacetKey, string | null>>({
    style: null,
    color: null,
    mood: null,
  });
  const [offsets, setOffsets] = useState<Record<FacetKey, number>>({
    style: 0,
    color: 0,
    mood: 0,
  });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setOffsets((current) => ({
        style: (current.style + 4) % FACETS[0].options.length,
        color: (current.color + 4) % FACETS[1].options.length,
        mood: (current.mood + 4) % FACETS[2].options.length,
      }));
    }, ROTATION_MS);
    return () => window.clearInterval(interval);
  }, []);

  const selected = useMemo(() => {
    const values = Object.entries(active).filter(([, value]) => value);
    if (values.length === 0) return "All works";
    return values.map(([key, value]) => `${key}: ${titleCase(value ?? "")}`).join(" · ");
  }, [active]);

  return (
    <main className="facet-orbit">
      <header className="facet-orbit__masthead">
        <div>
          <p className="facet-orbit__eyebrow">ARTCOVR / Collection index</p>
          <h1 className="facet-orbit__title">Find your frequency.</h1>
        </div>
        <p className="facet-orbit__meta">92 works<br />curated archive</p>
      </header>

      <section className="facet-orbit__intro">
        <p className="facet-orbit__intro-copy">
          Three signals are enough to move through the collection. Choose a style,
          a color, or a mood. The index keeps turning so the archive stays open.
        </p>
        <p className="facet-orbit__hint">
          Style stays focused<br />
          color + mood open wider
        </p>
      </section>

      <section className="facet-orbit__grid" aria-label="Collection filters">
        {FACETS.map((facet, facetIndex) => {
          const choices = visibleOptions(
            facet.options,
            active[facet.key],
            offsets[facet.key],
            facet.visibleCount,
          );
          return (
            <article className="facet-orbit__card" data-facet={facet.key} key={facet.key}>
              <header className="facet-orbit__card-head">
                <p className="facet-orbit__label">{facet.label}</p>
                <p className="facet-orbit__index">
                  0{facetIndex + 1} / {facet.visibleCount + 1} visible
                </p>
              </header>
              <div className="facet-orbit__choices">
                <button
                  type="button"
                  className="facet-orbit__choice"
                  data-active={active[facet.key] === null}
                  aria-pressed={active[facet.key] === null}
                  onClick={() => setActive((current) => ({ ...current, [facet.key]: null }))}
                >
                  All
                </button>
                {choices.map((choice) => (
                  <button
                    type="button"
                    key={choice}
                    className="facet-orbit__choice"
                    data-has-swatch={facet.swatches?.[choice] ? "true" : undefined}
                    data-color-choice={facet.key === "color" ? "true" : undefined}
                    data-active={active[facet.key] === choice}
                    aria-pressed={active[facet.key] === choice}
                    aria-label={facet.key === "color" ? `Color: ${choice}` : undefined}
                    onClick={() => setActive((current) => ({ ...current, [facet.key]: choice }))}
                  >
                    {facet.key === "color" ? (
                      <span
                        className="facet-orbit__swatch"
                        aria-hidden="true"
                        style={{ background: facet.swatches?.[choice] }}
                      />
                    ) : (
                      choice
                    )}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <footer className="facet-orbit__footer">
        <div className="facet-orbit__selected">
          <p className="facet-orbit__note">Showing</p>
          <p className="facet-orbit__selected-value">{selected}</p>
        </div>
        <div className="facet-orbit__status">
          <span className="facet-orbit__pulse" aria-hidden="true" />
          rotating index
        </div>
      </footer>
    </main>
  );
}
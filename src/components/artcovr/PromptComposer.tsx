"use client";

import { useMemo } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { getVisualEntry, getVisualStyleLabel } from "@/lib/artcovr/artworks";

/**
 * Structured prompt controls that compile into the same freeform prompt string
 * the studio has always sent.
 *
 * Every chip owns one plain-English clause. Toggling a chip appends or removes
 * that clause from the visible textarea, so the compiled prompt is never
 * hidden, always editable by hand, and the request body shape is unchanged.
 * Chip vocabulary is derived from this artwork's real metadata (moodTags,
 * category) plus its committed visual-index labels — nothing is invented.
 */

/** `Warm_Autumnal_Sunset` -> `warm autumnal sunset`. */
function humanizeLabel(label: string) {
  return label
    .replaceAll("__", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .trim();
}

export type PromptChip = { id: string; label: string; clause: string };
type ChipGroup = { id: string; title: string; hint: string; chips: PromptChip[] };

function collapse(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\s+\./g, ".").trim();
}

export function hasClause(prompt: string, clause: string) {
  return prompt.includes(clause);
}

export function applyClause(prompt: string, clause: string) {
  if (hasClause(prompt, clause)) return collapse(prompt.split(clause).join(" "));
  return collapse(`${prompt} ${clause}`);
}

function buildGroups(artwork: Artwork): ChipGroup[] {
  const entry = getVisualEntry(artwork.slug);
  const styleLabel = getVisualStyleLabel(artwork.slug);
  const labels = entry?.labels;

  const moodValues = new Set<string>();
  for (const tag of artwork.moodTags.slice(0, 4)) moodValues.add(humanizeLabel(tag));
  if (labels?.mood?.label) moodValues.add(humanizeLabel(labels.mood.label));

  const paletteValues = new Set<string>();
  if (labels?.domcolor?.label) paletteValues.add(humanizeLabel(labels.domcolor.label));
  if (labels?.colorblend?.label) paletteValues.add(humanizeLabel(labels.colorblend.label));
  for (const generic of ["cooler blues", "warmer reds", "high contrast", "muted and desaturated"]) {
    paletteValues.add(generic);
  }

  const characterValues = new Set<string>();
  if (styleLabel) characterValues.add(humanizeLabel(styleLabel));
  if (artwork.category) characterValues.add(humanizeLabel(artwork.category));
  if (labels?.category?.label) characterValues.add(humanizeLabel(labels.category.label));
  if (labels?.medium?.label) characterValues.add(humanizeLabel(labels.medium.label));

  const weather = labels?.weather?.label ? humanizeLabel(labels.weather.label) : "atmospheric";

  const groups: ChipGroup[] = [
    {
      id: "intent",
      title: "Intent",
      hint: "What kind of edit this is.",
      chips: [
        {
          id: "intent-palette-only",
          label: "Keep composition, change palette",
          clause: "Keep the existing composition and change only the palette.",
        },
        {
          id: "intent-darker",
          label: "Make it darker",
          clause: "Make the overall image darker and more shadowed.",
        },
        {
          id: "intent-lighter",
          label: "Make it lighter",
          clause: "Make the overall image lighter and more open.",
        },
        {
          id: "intent-weather",
          label: "Add weather",
          clause: `Add ${weather} weather to the scene.`,
        },
        {
          id: "intent-minimal",
          label: "Simplify to minimal shapes",
          clause: "Simplify the scene down to minimal geometric shapes.",
        },
        {
          id: "intent-type-space",
          label: "Leave room for cover type",
          clause: "Leave clear negative space near the top for cover typography.",
        },
      ],
    },
    {
      id: "mood",
      title: "Mood",
      hint: "From this work's own mood tags.",
      chips: [...moodValues].map((value) => ({
        id: `mood-${value.replaceAll(" ", "-")}`,
        label: value,
        clause: `Lean into a ${value} mood.`,
      })),
    },
    {
      id: "palette",
      title: "Palette direction",
      hint: "From this work's indexed colour labels.",
      chips: [...paletteValues].map((value) => ({
        id: `palette-${value.replaceAll(" ", "-")}`,
        label: value,
        clause: `Shift the palette toward ${value}.`,
      })),
    },
    {
      id: "character",
      title: "Hold its character",
      hint: "Style and subject signals already recorded for this work.",
      chips: [...characterValues].map((value) => ({
        id: `character-${value.replaceAll(" ", "-")}`,
        label: value,
        clause: `Keep the ${value} character of the original.`,
      })),
    },
  ];

  return groups.filter((group) => group.chips.length > 0);
}

export function PromptComposer({
  artwork,
  value,
  onChange,
  disabled,
}: {
  artwork: Artwork;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const groups = useMemo(() => buildGroups(artwork), [artwork]);

  return (
    <div className="mt-6 space-y-5">
      {groups.map((group) => (
        <fieldset key={group.id} className="border-0 p-0">
          <legend className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">
            {group.title}
          </legend>
          {/* opacity-60 is the floor here: at 50% this 11px text measures
              ~3.7:1 on the cream background, under the 4.5:1 AA minimum. */}
          <p className="mt-1 text-[11px] leading-4 opacity-60">{group.hint}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.chips.map((chip) => {
              const active = hasClause(value, chip.clause);
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onChange(applyClause(value, chip.clause))}
                  className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? "artcovr-button border-current"
                      : "border-current/30 hover:border-current"
                  }`}
                >
                  {chip.label}
                  {/*
                    The clause is appended as hidden text rather than set as a
                    `title`, which would REPLACE the accessible name and leave
                    it without the visible label — a WCAG 2.5.3 failure for
                    voice control. As a suffix the visible label still leads.
                  */}
                  <span className="sr-only"> — {chip.clause}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

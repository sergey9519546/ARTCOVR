"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Album-style cover typography, rendered as a DOM layer ON TOP of the image.
 *
 * This is deliberately NOT a canvas composite. Studio previews are watermarked
 * and the clean master never reaches the browser, so compositing text into
 * pixels here would either bake in the watermark or invite an attempt to
 * reconstruct clean bytes client-side. The layer is presentation only: it
 * mutates nothing, it is never exported, and there is no download control for
 * it anywhere in this file. Typographed deliverables are a future server-side
 * feature; the UI says so in plain words.
 */

export type CoverPosition =
  | "top-left"
  | "top-right"
  | "center"
  | "lower-third"
  | "bottom-left"
  | "bottom-right";
export type CoverSize = "small" | "medium" | "large";
export type CoverTone = "light" | "dark";
export type CoverTreatment = "stack" | "rule" | "quiet";

export type CoverTypeState = {
  enabled: boolean;
  title: string;
  artist: string;
  position: CoverPosition;
  size: CoverSize;
  tone: CoverTone;
  treatment: CoverTreatment;
};

const POSITIONS: { value: CoverPosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "center", label: "Centre" },
  { value: "lower-third", label: "Lower third" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

const SIZES: { value: CoverSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const TREATMENTS: { value: CoverTreatment; label: string }[] = [
  { value: "stack", label: "Stacked" },
  { value: "rule", label: "Ruled" },
  { value: "quiet", label: "Quiet" },
];

/** Cover-plate ink. Fixed on purpose: this sits over artwork, not over the page. */
const INK = { light: "#f3ecd9", dark: "#0b0b0b" } as const;

/** Root font size of the layer, in container-query width units. */
const SCALE_CQW: Record<CoverSize, number> = { small: 4.2, medium: 6, large: 8.4 };

function coverTypeKey(artworkId: string) {
  return `artcovr:cover-type:${artworkId}`;
}

function defaultState(title: string): CoverTypeState {
  return {
    enabled: false,
    title,
    artist: "",
    position: "lower-third",
    size: "medium",
    tone: "light",
    treatment: "stack",
  };
}

function isPosition(value: unknown): value is CoverPosition {
  return POSITIONS.some((option) => option.value === value);
}

function coerce(raw: unknown, fallback: CoverTypeState): CoverTypeState {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<CoverTypeState>;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    title: typeof value.title === "string" ? value.title.slice(0, 80) : fallback.title,
    artist: typeof value.artist === "string" ? value.artist.slice(0, 80) : fallback.artist,
    position: isPosition(value.position) ? value.position : fallback.position,
    size: SIZES.some((option) => option.value === value.size)
      ? (value.size as CoverSize)
      : fallback.size,
    tone: value.tone === "light" || value.tone === "dark" ? value.tone : fallback.tone,
    treatment: TREATMENTS.some((option) => option.value === value.treatment)
      ? (value.treatment as CoverTreatment)
      : fallback.treatment,
  };
}

/**
 * Overlay state, persisted with the same guarded-sessionStorage idiom the
 * studio uses for its selected preview: every read and write is wrapped,
 * because private modes and locked-down iframes throw on access.
 */
export function useCoverType(artworkId: string, artworkTitle: string) {
  const [state, setState] = useState<CoverTypeState>(() => defaultState(artworkTitle));

  useEffect(() => {
    const fallback = defaultState(artworkTitle);
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(coverTypeKey(artworkId));
    } catch {
      return;
    }
    if (!stored) return;
    try {
      setState(coerce(JSON.parse(stored), fallback));
    } catch {
      // A corrupt entry is not worth a crash; the defaults already hold.
    }
  }, [artworkId, artworkTitle]);

  const update = useCallback(
    (patch: Partial<CoverTypeState>) => {
      setState((previous) => {
        const next = { ...previous, ...patch };
        try {
          sessionStorage.setItem(coverTypeKey(artworkId), JSON.stringify(next));
        } catch {
          // Presentation-only state. Losing it costs the user nothing.
        }
        return next;
      });
    },
    [artworkId],
  );

  return { coverType: state, updateCoverType: update };
}

function placement(position: CoverPosition) {
  if (position === "center") return { align: "center", justify: "center", text: "center" } as const;
  if (position === "lower-third") return { align: "center", justify: "flex-end", text: "center" } as const;
  if (position === "top-left") return { align: "flex-start", justify: "flex-start", text: "left" } as const;
  if (position === "top-right") return { align: "flex-end", justify: "flex-start", text: "right" } as const;
  if (position === "bottom-right") return { align: "flex-end", justify: "flex-end", text: "right" } as const;
  return { align: "flex-start", justify: "flex-end", text: "left" } as const;
}

function scrim(position: CoverPosition, tone: CoverTone) {
  const stop = tone === "light" ? "rgb(0 0 0 / 62%)" : "rgb(243 236 217 / 70%)";
  if (position === "center") {
    return `radial-gradient(closest-side at 50% 50%, ${stop}, transparent 78%)`;
  }
  if (position.startsWith("top")) {
    return `linear-gradient(to bottom, ${stop}, transparent 58%)`;
  }
  return `linear-gradient(to top, ${stop}, transparent 62%)`;
}

/**
 * The visual layer. Absolutely positioned, non-interactive, and hidden from
 * assistive tech: everything it shows is already present as editable form
 * fields, so announcing it twice would only add noise.
 */
export function CoverTypeLayer({ state }: { state: CoverTypeState }) {
  const title = state.title.trim();
  const artist = state.artist.trim();
  if (!state.enabled || (!title && !artist)) return null;

  const spot = placement(state.position);
  const ink = INK[state.tone];
  const shadow =
    state.tone === "light" ? "0 0.04em 0.16em rgb(0 0 0 / 55%)" : "0 0.04em 0.16em rgb(243 236 217 / 55%)";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 select-none"
      style={{ background: scrim(state.position, state.tone) }}
    >
      <div
        className="flex h-full w-full flex-col p-[6%]"
        style={{
          alignItems: spot.align,
          justifyContent: spot.justify,
          fontSize: `${SCALE_CQW[state.size]}cqw`,
          color: ink,
          textAlign: spot.text,
          textShadow: shadow,
        }}
      >
        {state.treatment === "stack" ? (
          <>
            {title ? (
              <span
                className="artcovr-wordmark block max-w-full break-words uppercase"
                style={{ fontSize: "1em", fontWeight: 800 }}
              >
                {title}
              </span>
            ) : null}
            {artist ? (
              <span
                className="mt-[0.5em] block max-w-full break-words uppercase"
                style={{ fontSize: "0.3em", fontWeight: 700, letterSpacing: "0.3em" }}
              >
                {artist}
              </span>
            ) : null}
          </>
        ) : null}

        {state.treatment === "rule" ? (
          <>
            {artist ? (
              <span
                className="block max-w-full break-words uppercase"
                style={{ fontSize: "0.28em", fontWeight: 700, letterSpacing: "0.34em" }}
              >
                {artist}
              </span>
            ) : null}
            <span
              className="my-[0.34em] block"
              style={{ width: "3.6em", height: "max(1px, 0.03em)", background: ink }}
            />
            {title ? (
              <span
                className="block max-w-full break-words uppercase"
                style={{ fontSize: "0.78em", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 0.95 }}
              >
                {title}
              </span>
            ) : null}
          </>
        ) : null}

        {state.treatment === "quiet" ? (
          <>
            {title ? (
              <span
                className="block max-w-full break-words uppercase"
                style={{ fontSize: "0.42em", fontWeight: 700, letterSpacing: "0.24em", lineHeight: 1.3 }}
              >
                {title}
              </span>
            ) : null}
            {artist ? (
              <span
                className="mt-[0.6em] block max-w-full break-words uppercase"
                style={{ fontSize: "0.24em", fontWeight: 400, letterSpacing: "0.4em", opacity: 0.85 }}
              >
                {artist}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

const FIELD =
  "mt-1 w-full border border-current/30 bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-current disabled:cursor-not-allowed disabled:opacity-40";
const LEGEND = "text-[10px] font-bold uppercase tracking-[0.14em] opacity-60";

/** The control panel. Plain form controls, native focus ring, no motion. */
export function CoverTypeControls({
  state,
  onChange,
  disabled,
}: {
  state: CoverTypeState;
  onChange: (patch: Partial<CoverTypeState>) => void;
  disabled?: boolean;
}) {
  return (
    <section aria-labelledby="cover-type-title" className="mt-6 border border-current/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="cover-type-title" className="text-[11px] font-bold uppercase tracking-[0.12em]">
            Cover type
          </h3>
          <p className="mt-1 max-w-[46ch] text-[11px] leading-4 opacity-60">
            Lay a title and artist name over the image to see how it reads as a cover. This is a
            preview mockup only — nothing is written into the image, and typographed deliverables
            are a future feature.
          </p>
        </div>
        {/*
          The input sits OUTSIDE its label on purpose. Nesting a control in a
          label that also carries `htmlFor` pointing back at it makes a click
          activate the control twice — the direct hit plus the label's
          forwarded one — so the checkbox toggles to its original value and
          "Show type" appears dead. Sibling + htmlFor names it once and fires
          once.
        */}
        <div className="flex shrink-0 items-center gap-2">
          <input
            id="cover-enabled"
            type="checkbox"
            checked={state.enabled}
            disabled={disabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
            className="size-4 accent-current disabled:cursor-not-allowed"
          />
          <label
            htmlFor="cover-enabled"
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
          >
            Show type
          </label>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="cover-title" className={LEGEND}>
            Title
          </label>
          <input
            id="cover-title"
            type="text"
            maxLength={80}
            value={state.title}
            disabled={disabled}
            onChange={(event) => onChange({ title: event.target.value })}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="cover-artist" className={LEGEND}>
            Artist name
          </label>
          <input
            id="cover-artist"
            type="text"
            maxLength={80}
            placeholder="Your artist or band name"
            value={state.artist}
            disabled={disabled}
            onChange={(event) => onChange({ artist: event.target.value })}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="cover-position" className={LEGEND}>
            Position
          </label>
          <select
            id="cover-position"
            value={state.position}
            disabled={disabled}
            onChange={(event) => onChange({ position: event.target.value as CoverPosition })}
            className={FIELD}
          >
            {POSITIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cover-size" className={LEGEND}>
            Size
          </label>
          <select
            id="cover-size"
            value={state.size}
            disabled={disabled}
            onChange={(event) => onChange({ size: event.target.value as CoverSize })}
            className={FIELD}
          >
            {SIZES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cover-treatment" className={LEGEND}>
            Treatment
          </label>
          <select
            id="cover-treatment"
            value={state.treatment}
            disabled={disabled}
            onChange={(event) => onChange({ treatment: event.target.value as CoverTreatment })}
            className={FIELD}
          >
            {TREATMENTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cover-tone" className={LEGEND}>
            Ink
          </label>
          <select
            id="cover-tone"
            value={state.tone}
            disabled={disabled}
            onChange={(event) => onChange({ tone: event.target.value as CoverTone })}
            className={FIELD}
          >
            <option value="light">Light on dark</option>
            <option value="dark">Dark on light</option>
          </select>
        </div>
      </div>
    </section>
  );
}

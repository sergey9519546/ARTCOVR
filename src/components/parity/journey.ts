/*
 * The journey maths — pure, framework-free, SSR-safe.
 *
 * The archive travels along one continuous rail through space. There is no
 * "vertical", "horizontal" and "spiral" mode; there is a single master
 * progress P in [0, 1] that the scroll layer owns, and these helpers turn it
 * into the two visual states the rail happens to wear at any moment:
 *
 *   · a horizontal outrun of cards   (carousel phase)
 *   · a depth tunnel that is curving  (spiral phase)
 *
 * The two phases overlap inside a blend window sized in master scroll pixels,
 * so the rail never "switches direction" — it merely bends. Because every
 * visible value is a continuous function of P, scrolling forward and backward
 * share identical continuity (C0/C1) by construction.
 */

export const JOURNEY_PX_PER_CARD = 170;
export const JOURNEY_CAROUSEL_MIN_SCROLL = 6000;
// Forty sampled covers need enough physical wheel travel to be read rather
// than flashed past. At 12,000px the spiral advances about 300px per cover.
export const JOURNEY_SPIRAL_SPAN = 12000;
// Master scroll pixels shared by both phases during the hand-off. Small enough
// that the two motions co-exist (a real momentum hand-off), large enough that
// no single frame reads as a cut.
export const JOURNEY_BLEND = 900;
export const SHARED_HANDOFF_SWITCH = 0.5;

const CAROUSEL_CARD_MIN = 320;
const CAROUSEL_CARD_MAX = 880;
const CAROUSEL_CARD_VIEWPORT_RATIO = 0.66;

export function carouselCardSizeForViewport(viewportHeight: number) {
  return Math.round(
    Math.min(
      Math.max(viewportHeight * CAROUSEL_CARD_VIEWPORT_RATIO, CAROUSEL_CARD_MIN),
      CAROUSEL_CARD_MAX,
    ),
  );
}

/**
 * The handle the pinned {@link ScrollJourney} wrapper hands to each layer.
 * Children register an updater that the master ScrollTrigger calls every frame
 * with the live master progress; they never create their own triggers.
 *
 * Keeping this type in the framework-free maths module keeps the component
 * layer free of import cycles (the wrapper imports the children; the children
 * import only this type).
 */
export interface JourneyStore {
  consts: JourneyConsts;
  register: (updater: (progress: number) => void) => () => void;
}

export function carouselSpanFor(featuredCount: number): number {
  return Math.max(
    JOURNEY_CAROUSEL_MIN_SCROLL,
    featuredCount * JOURNEY_PX_PER_CARD,
  );
}

export interface JourneyConsts {
  /** Master scroll pixels consumed by the whole journey. */
  total: number;
  /** Scroll pixels spent reaching the end of the horizontal outrun. */
  carouselSpan: number;
  /** Scroll pixels spent inside the spiral tunnel (independent of the rail). */
  spiralSpan: number;
  /** Scroll pixels where both phases are visibly active. */
  blend: number;
  /** Master P at which the carousel outrun reaches its end. */
  carouselEndP: number;
  /** Master P at which the spiral tunnel begins taking over. */
  spiralStartP: number;
  /** Cross-fade window in master P. */
  fadeStartP: number;
  fadeEndP: number;
}

export function makeJourneyConsts(featuredCount: number): JourneyConsts {
  const carouselSpan = carouselSpanFor(featuredCount);
  const spiralSpan = JOURNEY_SPIRAL_SPAN;
  const blend = Math.min(JOURNEY_BLEND, carouselSpan, spiralSpan);
  const total = carouselSpan + spiralSpan;
  return {
    total,
    carouselSpan,
    spiralSpan,
    blend,
    carouselEndP: carouselSpan / total,
    spiralStartP: (carouselSpan - blend) / total,
    fadeStartP: (carouselSpan - blend) / total,
    fadeEndP: (carouselSpan + blend) / total,
  };
}

/** Smooth Hermite step; continuous in value and first derivative. */
export function smoothstep(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export interface JourneyPhases {
  /** Carousel outrun progress — drives translateX of the track, 0..1. */
  c: number;
  /** Spiral tunnel progress — drives the camera down the tunnel, 0..1. */
  s: number;
  /** Layer opacity, eased through the blend. Used so both are visible together. */
  carouselOpacity: number;
  spiralOpacity: number;
  /** 0..1 weight used to tilt the flat outrun back into the screen plane. */
  carouselPlunge: number;
  /** Shared-element transfer progress across the overlap window. */
  handoff: number;
}

export function journeyPhases(P: number, k: JourneyConsts): JourneyPhases {
  const carouselEndP = k.carouselEndP || 1;
  const c = clamp01(P / carouselEndP);

  const spiralSpanP = 1 - k.spiralStartP;
  const s = spiralSpanP > 0 ? clamp01((P - k.spiralStartP) / spiralSpanP) : 0;

  const fadeRange = k.fadeEndP - k.fadeStartP;
  const fadeLocal = fadeRange > 0 ? (P - k.fadeStartP) / fadeRange : P >= k.fadeStartP ? 1 : 0;
  // Pop the plunge a touch earlier than the opacity cross-fade so the flat
  // outrun begins to recede before it starts to vanish — the plane lifts away
  // from the viewer a beat ahead of the spiral replacing it.
  const plungeLocal = fadeRange > 0 ? (P - (k.fadeStartP - fadeRange * 0.18)) / fadeRange : P >= k.fadeStartP ? 1 : 0;

  return {
    c,
    s,
    carouselOpacity: 1 - smoothstep(fadeLocal),
    spiralOpacity: smoothstep(fadeLocal),
    carouselPlunge: smoothstep(plungeLocal),
    handoff: smoothstep(fadeLocal),
  };
}

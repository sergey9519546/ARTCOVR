import type { ArtworkOrderPreferenceMode } from "@workspace/api-client-react";

export const DEFAULT_ARTWORK_ORDER_PREFERENCE: ArtworkOrderPreferenceMode =
  "rotate";
export const ARTWORK_ORDER_PREFERENCE_STORAGE_KEY =
  "artcovr:artwork-order-preference:v1";

const VISIT_SESSION_KEY = "artcovr:artwork-order-visit:v1";
const VISIT_COUNTER_KEY = "artcovr:artwork-order-visit-counter:v1";

export type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export function isArtworkOrderPreference(
  value: unknown,
): value is ArtworkOrderPreferenceMode {
  return value === "rotate" || value === "shuffle";
}

export function readBrowserArtworkOrderPreference(
  storage: BrowserStorage,
): ArtworkOrderPreferenceMode | null {
  const value = storage.getItem(ARTWORK_ORDER_PREFERENCE_STORAGE_KEY);
  return isArtworkOrderPreference(value) ? value : null;
}

export function writeBrowserArtworkOrderPreference(
  storage: BrowserStorage,
  preference: ArtworkOrderPreferenceMode,
) {
  try {
    storage.setItem(ARTWORK_ORDER_PREFERENCE_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getOrCreateArtworkVisitIndex(
  sessionStorage: BrowserStorage,
  localStorage: BrowserStorage,
) {
  let existing: number | null = null;
  try {
    existing = positiveInteger(sessionStorage.getItem(VISIT_SESSION_KEY));
  } catch {
    // Continue with a new visit index if session storage is unavailable.
  }
  if (existing !== null) return { visitIndex: existing, persisted: true };

  let previous = 0;
  try {
    previous = positiveInteger(localStorage.getItem(VISIT_COUNTER_KEY)) ?? 0;
  } catch {
    // A session-scoped index can still keep this visit stable.
  }

  const visitIndex = previous + 1;
  let sessionSaved = false;
  let localSaved = false;
  try {
    sessionStorage.setItem(VISIT_SESSION_KEY, String(visitIndex));
    sessionSaved = true;
  } catch {
    // The current page can still use the in-memory index.
  }
  try {
    localStorage.setItem(VISIT_COUNTER_KEY, String(visitIndex));
    localSaved = true;
  } catch {
    // The current page can still use the in-memory index.
  }

  return { visitIndex, persisted: sessionSaved && localSaved };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function orderArtworkForVisit<T>(
  items: readonly T[],
  preference: ArtworkOrderPreferenceMode,
  visitIndex: number,
): T[] {
  if (items.length < 2) return [...items];

  if (preference === "rotate") {
    const offset = ((Math.trunc(visitIndex) % items.length) + items.length) %
      items.length;
    return [...items.slice(offset), ...items.slice(0, offset)];
  }

  const shuffled = [...items];
  const random = seededRandom(Math.trunc(visitIndex));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

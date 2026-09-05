export const SIGNED_URL_REFRESH_BUFFER_MS = 60_000;

/**
 * Returns when the earliest valid signed URL should be renewed. Invalid or
 * absent expirations are ignored so a staggered frontend/Edge deployment does
 * not create a zero-delay refresh loop.
 */
export function signedUrlRefreshDelay(
  expirations: Array<string | undefined>,
  nowMs = Date.now(),
) {
  const validExpirations = expirations
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite);

  if (validExpirations.length === 0) return null;
  return Math.max(
    0,
    Math.min(...validExpirations) - nowMs - SIGNED_URL_REFRESH_BUFFER_MS,
  );
}

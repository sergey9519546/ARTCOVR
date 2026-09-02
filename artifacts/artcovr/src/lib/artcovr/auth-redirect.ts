export function getSafeAuthRedirect(fallback: string) {
  if (typeof window === "undefined") return fallback;

  const requested = new URLSearchParams(window.location.search).get("redirect_url");
  if (!requested) return fallback;

  try {
    const url = new URL(requested, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/")) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
const unsafeNavigationEncoding = /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/i;
const unsafeNavigationCharacters = /[\\\u0000-\u001f\u007f]/;

export function safeNext(value: string | null, origin: string) {
  const fallback = "/my-images";
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeNavigationCharacters.test(value) ||
    unsafeNavigationEncoding.test(value)
  ) {
    return fallback;
  }

  try {
    const base = new URL(origin);
    const destination = new URL(value, base);
    if (
      destination.origin !== base.origin ||
      destination.pathname.startsWith("//") ||
      unsafeNavigationCharacters.test(destination.pathname) ||
      unsafeNavigationEncoding.test(destination.pathname)
    ) {
      return fallback;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function isDevelopmentClerkKey(key: string | undefined) {
  return key?.trim().startsWith("pk_test_") ?? false;
}

export function assertProductionClerkKey(key: string | undefined) {
  if (!key?.trim()) {
    throw new Error(
      "VITE_CLERK_PUBLISHABLE_KEY is required for production builds.",
    );
  }

  if (!key.trim().startsWith("pk_live_")) {
    throw new Error(
      "Production builds require a live Clerk publishable key, not a development key.",
    );
  }

  return key;
}
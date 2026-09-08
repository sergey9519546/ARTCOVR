type DownloadIdentity = {
  kind: "base" | "selected_preview" | "purchased_result";
  purchaseId: string;
  artworkId: string;
  generationId: string | null;
};

/** Call only after ownership and the active purchase entitlement are verified. */
export async function prepareAccountDownload(
  identity: DownloadIdentity,
  resolveKey: () => Promise<string>,
  entitlementExpiry: Date,
  sign: (key: string, ttlSeconds: number) => Promise<string>,
  now = Date.now,
) {
  // Pick fields explicitly: private keys and storage errors never leave this helper.
  const publicIdentity = {
    kind: identity.kind,
    purchaseId: identity.purchaseId,
    artworkId: identity.artworkId,
    generationId: identity.generationId,
  };
  try {
    const key = await resolveKey();
    const issuedAt = now();
    const ttlSeconds = Math.min(300, Math.floor((entitlementExpiry.getTime() - issuedAt) / 1000));
    if (!Number.isFinite(ttlSeconds) || ttlSeconds < 1) throw new Error("Entitlement expired while preparing download.");
    const url = await sign(key, ttlSeconds);
    if (!url) throw new Error("Storage returned no download URL.");
    return {
      download: {
        ...publicIdentity,
        expiresAt: entitlementExpiry.toISOString(),
        urlExpiresAt: new Date(issuedAt + ttlSeconds * 1000).toISOString(),
        url,
      },
      unavailable: null,
    };
  } catch {
    return {
      download: null,
      unavailable: { ...publicIdentity, code: "asset_unavailable" as const },
    };
  }
}

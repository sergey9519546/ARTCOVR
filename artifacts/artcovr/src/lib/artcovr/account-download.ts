import type { AccountData, AccountDownload } from "./functions";

/** Resolve by stable identity only; a previously displayed URL is never reused. */
export function resolveCurrentDownload(
  account: AccountData,
  requested: Pick<AccountDownload, "kind" | "purchaseId" | "artworkId" | "generationId">,
  now = Date.now(),
): AccountDownload {
  const purchase = account.purchases.find((entry) => entry.id === requested.purchaseId);
  if (!purchase || purchase.artworkId !== requested.artworkId || purchase.status !== "paid" || purchase.accessRevokedAt ||
      !purchase.entitlementExpiresAt || !(Date.parse(purchase.entitlementExpiresAt) > now)) {
    throw new Error("Download access is no longer active. Review the purchase status below or contact support.");
  }
  const download = account.downloads.find((entry) =>
    entry.kind === requested.kind && entry.purchaseId === requested.purchaseId &&
    entry.artworkId === requested.artworkId && entry.generationId === requested.generationId,
  );
  if (!download || !download.url ||
      (download.urlExpiresAt && !(Date.parse(download.urlExpiresAt) > now))) {
    throw new Error("This file could not be prepared. Retry the download in a moment or contact support.");
  }
  return download;
}

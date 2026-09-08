import type { AccountData, AccountGeneration } from "./functions.ts";

/** An older history page is not an authoritative account refresh. */
export function appendOlderCreditActivity(
  current: AccountData,
  page: Pick<AccountData, "creditActivity" | "creditActivityNextCursor">,
  requestedCursor: string,
): AccountData {
  // A refresh or another page may have changed the continuation while this
  // request was pending. Never roll it back or append to the wrong history.
  if (!requestedCursor || current.creditActivityNextCursor !== requestedCursor || !page.creditActivity) return current;

  const activities = current.creditActivity ?? [];
  // Keyset pages are disjoint. Public fields are not ledger identities: distinct
  // events can have identical labels, amounts and millisecond timestamps.
  return {
    ...current,
    creditActivity: [...activities, ...page.creditActivity],
    creditActivityNextCursor: page.creditActivityNextCursor ?? null,
  };
}

/** Account responses deliberately omit private prompt text. */
export function generationHistoryLabel(
  generation: Pick<AccountGeneration, "phase">,
): string {
  return generation.phase === "preview" ? "Generated preview" : "Generated edit";
}

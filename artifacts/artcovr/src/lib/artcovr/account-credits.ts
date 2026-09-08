type PurchaseCredits = {
  remainingCredits?: unknown;
  remainingGenerations?: unknown;
};

function validBalance(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

/** Display compatibility only; the server always authorizes credit spending. */
export function purchaseCreditBalance(purchase: PurchaseCredits): number {
  return validBalance(purchase.remainingCredits === undefined
    ? purchase.remainingGenerations
    : purchase.remainingCredits);
}

export function accountCreditBalance(account: {
  totalCreditBalance?: unknown;
  purchases: readonly PurchaseCredits[];
}): number {
  if (account.totalCreditBalance !== undefined) return validBalance(account.totalCreditBalance);
  return validBalance(account.purchases.reduce(
    (total, purchase) => total + purchaseCreditBalance(purchase), 0,
  ));
}

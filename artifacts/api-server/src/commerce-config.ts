import config from "../../artcovr/src/lib/artcovr/commerce-config.json" with {
  type: "json",
};

export const commerceConfig = config as {
  currency: "usd";
  includedCreditsPerCover: number;
  creditPriceCents: number;
  generationCostCents: number;
};

export function licenseTermsForSaleMode(saleMode: "exclusive" | "repeatable") {
  return saleMode === "exclusive"
    ? "Exclusive commercial use license. The purchaser receives exclusive commercial rights to this cover."
    : "Non-exclusive commercial use license. The purchaser receives commercial rights to use this cover.";
}
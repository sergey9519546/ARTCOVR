import { expect, type Page, type Route } from "@playwright/test";

export const fixtureImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23122519'/%3E%3C/svg%3E";

export function useDeterministicSignIn(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem("artcovr:e2e-auth", "signed-in");
  });
}

export async function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export function accountFixture() {
  return {
    purchases: [
      {
        id: "purchase-e2e",
        artworkId: "art_382f017ddadad8dcd971",
        artworkTitle: "Buried Clocks",
        artworkSlug: "buried-clocks",
        saleMode: "repeatable",
        status: "paid",
        amountCents: 3500,
        currency: "USD",
        paidAt: "2026-08-20T12:00:00.000Z",
        entitlementExpiresAt: "2030-09-20T12:00:00.000Z",
        selectedPreviewGenerationId: "generation-preview",
        resetSource: "original",
        accessRevokedAt: null,
        accessRevocationReason: null,
        remainingGenerations: 2,
      },
    ],
    generations: [
      {
        id: "generation-purchased",
        artworkId: "art_382f017ddadad8dcd971",
        purchaseId: "purchase-e2e",
        prompt: "Add a quiet amber glow.",
        phase: "purchased",
        status: "succeeded",
        createdAt: "2026-08-20T12:05:00.000Z",
        expiresAt: "2030-09-20T12:00:00.000Z",
        previewUrl: fixtureImage,
        cleanUrl: fixtureImage,
      },
      {
        id: "generation-other-account",
        artworkId: "art_private",
        purchaseId: "purchase-other-account",
        prompt: "OTHER ACCOUNT PRIVATE PROMPT",
        phase: "purchased",
        status: "succeeded",
        createdAt: "2026-08-20T12:05:00.000Z",
        expiresAt: "2030-09-20T12:00:00.000Z",
        previewUrl: fixtureImage,
      },
    ],
    downloads: [
      {
        kind: "base",
        purchaseId: "purchase-e2e",
        artworkId: "art_382f017ddadad8dcd971",
        generationId: null,
        expiresAt: "2030-09-20T12:00:00.000Z",
        url: fixtureImage,
      },
      {
        kind: "purchased_result",
        purchaseId: "purchase-e2e",
        artworkId: "art_382f017ddadad8dcd971",
        generationId: "generation-purchased",
        expiresAt: "2030-09-20T12:00:00.000Z",
        url: fixtureImage,
      },
    ],
  };
}

export async function assertUsablePage(page: Page) {
  await expect(page.locator("#root")).toBeVisible();
  await expect(page.getByText("Something went wrong", { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label^="Error in "]')).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveText("");
}
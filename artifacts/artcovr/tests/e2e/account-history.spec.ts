import { expect, test } from "@playwright/test";
import { accountFixture, fulfillJson, useDeterministicSignIn } from "./fixtures";

for (const failOlderPage of [false, true]) {
  test(`older credit history ${failOlderPage ? "failure preserves" : "appends without replacing"} the current account`, async ({ page }) => {
    await useDeterministicSignIn(page);
    await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
    const account = accountFixture();
    const activity = {
      purchaseId: account.purchases[0].id,
      artworkTitle: account.purchases[0].artworkTitle,
      event: "generation",
      label: "Generation used",
      amount: -1,
      occurredAt: "2026-09-08T00:00:00.123Z",
    };
    await page.route("**/api/functions/v1/my-images**", async (route) => {
      const older = new URL(route.request().url()).searchParams.get("creditActivityCursor");
      if (older && failOlderPage) {
        return fulfillJson(route, { message: "Older credit activity could not be loaded." }, 502);
      }
      return fulfillJson(route, {
        ...account,
        totalCreditBalance: older ? 99 : 2,
        purchases: older ? [] : account.purchases,
        downloads: older ? [] : account.downloads,
        creditActivity: Array.from({ length: older ? 2 : 25 }, () => ({ ...activity })),
        creditActivityNextCursor: older ? null : "older-page-cursor",
      });
    });
    await page.goto("/my-images");
    const history = page.getByRole("region", { name: "Credit activity" });
    await expect(history.getByRole("listitem")).toHaveCount(25);
    const prompt = page.getByLabel("Image-edit prompt");
    await prompt.fill("Keep my current artwork edit");
    await page.getByRole("button", { name: "Load older activity", exact: true }).click();
    if (failOlderPage) {
      await expect(page.getByRole("status").filter({ hasText: "Older credit activity could not be loaded." })).toContainText("Your current edit is preserved.");
      await expect(history.getByRole("listitem")).toHaveCount(25);
      await expect(page.getByRole("button", { name: "Load older activity", exact: true })).toBeEnabled();
    } else {
      // Distinct ledger entries can have identical privacy-safe public fields.
      await expect(history.getByRole("listitem")).toHaveCount(27);
      await expect(page.getByRole("button", { name: "Load older activity", exact: true })).toHaveCount(0);
    }
    await expect(page.getByText("2 image-edit credits available across your purchases.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download base", exact: true })).toBeVisible();
    await expect(prompt).toHaveValue("Keep my current artwork edit");
  });
}

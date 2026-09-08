import { expect, test } from "@playwright/test";
import { accountFixture, fulfillJson, useDeterministicSignIn } from "./fixtures";

test("downloads refresh expired links without losing the current edit", async ({ page, context }) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
  let accountReads = 0;
  await page.route("**/api/functions/v1/my-images", (route) => {
    const account = accountFixture();
    accountReads += 1;
    account.downloads[0].url = `https://download.example/${accountReads === 1 ? "expired" : "fresh"}`;
    return fulfillJson(route, account);
  });
  const requestedUrls: string[] = [];
  await context.route("https://download.example/**", (route) => {
    requestedUrls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/plain", body: "Prepared artwork" });
  });
  await page.goto("/my-images");
  const prompt = page.getByLabel("Image-edit prompt");
  await prompt.fill("Keep my unfinished edit");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Download base", exact: true }).click();
  const downloadTab = await popup;
  await expect(downloadTab).toHaveURL("https://download.example/fresh");
  expect(requestedUrls).toEqual(["https://download.example/fresh"]);
  expect(accountReads).toBe(2);
  await expect(prompt).toHaveValue("Keep my unfinished edit");
  await downloadTab.close();
});

test("revoked access on refresh never follows a previously displayed signed URL", async ({ page, context }) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
  let accountReads = 0;
  await page.route("**/api/functions/v1/my-images", (route) => {
    const account = accountFixture();
    account.downloads[0].url = "https://download.example/should-never-open";
    accountReads += 1;
    if (accountReads > 1) {
      account.purchases[0].status = "refunded";
      account.downloads = [];
      account.generations = [];
    }
    return fulfillJson(route, account);
  });
  const requestedUrls: string[] = [];
  await context.route("https://download.example/**", (route) => {
    requestedUrls.push(route.request().url());
    return route.abort();
  });
  await page.goto("/my-images");
  await page.getByRole("button", { name: "Download base", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Download access is no longer active");
  await expect(page.getByRole("button", { name: "Download base", exact: true })).toHaveCount(0);
  expect(requestedUrls).toEqual([]);
});

test("partial download preparation failures offer retry and keep the editor mounted", async ({ page }) => {
  await useDeterministicSignIn(page);
  await page.route("**/api/functions/v1/claim-guest-purchases", (route) => fulfillJson(route, { claimedOrderIds: [], claimedCredits: 0 }));
  let accountReads = 0;
  await page.route("**/api/functions/v1/my-images", (route) => {
    const account = accountFixture();
    accountReads += 1;
    const base = account.downloads[0];
    if (accountReads === 1) {
      account.downloads = account.downloads.slice(1);
      return fulfillJson(route, { ...account, unavailableDownloads: [{ kind: base.kind, purchaseId: base.purchaseId, artworkId: base.artworkId, generationId: base.generationId, code: "asset_unavailable" }] });
    }
    return fulfillJson(route, { ...account, unavailableDownloads: [] });
  });
  await page.goto("/my-images");
  await expect(page.getByRole("alert")).toContainText("Some licensed files could not be prepared");
  const prompt = page.getByLabel("Image-edit prompt");
  await prompt.fill("Keep this edit through the retry");
  await page.getByRole("button", { name: "Retry downloads", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download base", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(prompt).toHaveValue("Keep this edit through the retry");
});

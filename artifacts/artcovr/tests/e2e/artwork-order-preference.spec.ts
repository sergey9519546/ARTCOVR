import { expect, test } from "@playwright/test";
import { fulfillJson, useDeterministicSignIn } from "./fixtures";

const preferenceStorageKey = "artcovr:artwork-order-preference:v1";
const control = (page: import("@playwright/test").Page) =>
  page.getByRole("group", { name: "Artwork order preference" });

test("guest artwork order stays selected across the homepage, archive, and reload", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const homeControl = control(page);
  await expect(homeControl).toBeVisible();

  await homeControl.getByRole("button", { name: "Shuffle" }).click();
  await expect(
    homeControl.getByRole("button", { name: "Shuffle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), preferenceStorageKey),
    )
    .toBe("shuffle");

  const homepageOrder = await page
    .locator("#artwork-grid-rest a[data-artwork='true']")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  const archiveControl = control(page);
  await expect(
    archiveControl.getByRole("button", { name: "Shuffle" }),
  ).toHaveAttribute("aria-pressed", "true");
  const archiveOrder = await page
    .locator('section[aria-label="Artwork archive"] article a')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    control(page).getByRole("button", { name: "Shuffle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page
        .locator('section[aria-label="Artwork archive"] article a')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    )
    .toEqual(archiveOrder);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    control(page).getByRole("button", { name: "Shuffle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page
        .locator("#artwork-grid-rest a[data-artwork='true']")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    )
    .toEqual(homepageOrder);
});

test("signed-in account preference overrides browser state and saves new choices", async ({
  page,
}) => {
  let accountPreference: "rotate" | "shuffle" = "rotate";
  await useDeterministicSignIn(page);
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "shuffle");
  }, preferenceStorageKey);
  await page.route(
    "**/api/functions/v1/artwork-order-preference",
    async (route) => {
      if (route.request().method() === "GET") {
        await fulfillJson(route, { preference: accountPreference });
        return;
      }

      const body = route.request().postDataJSON() as {
        preference?: "rotate" | "shuffle";
      };
      if (body.preference === "rotate" || body.preference === "shuffle") {
        accountPreference = body.preference;
      }
      await fulfillJson(route, { preference: accountPreference });
    },
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const homeControl = control(page);
  await expect(
    homeControl.getByRole("button", { name: "Rotation" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => window.localStorage.getItem(key), preferenceStorageKey),
    )
    .toBe("rotate");

  await homeControl.getByRole("button", { name: "Shuffle" }).click();
  await expect
    .poll(() => accountPreference)
    .toBe("shuffle");

  await page.goto("/archive", { waitUntil: "domcontentloaded" });
  await expect(
    control(page).getByRole("button", { name: "Shuffle" }),
  ).toHaveAttribute("aria-pressed", "true");
});

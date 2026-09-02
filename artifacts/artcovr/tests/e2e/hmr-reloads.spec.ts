import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const stylesheetPath = fileURLToPath(
  new URL("../../src/index.css", import.meta.url),
);
const appPath = fileURLToPath(new URL("../../src/App.tsx", import.meta.url));

test("a development stylesheet update keeps the preview usable", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "HMR is only available on the local Vite development server",
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();

  const originalStylesheet = await readFile(stylesheetPath, "utf8");
  const probeToken = "artcovr-hmr-probe";
  const probeRule = `\nhtml { --${probeToken}: ready; }\n`;

  try {
    await writeFile(stylesheetPath, `${originalStylesheet}${probeRule}`);
    await expect
      .poll(
        () =>
          page.evaluate((property) =>
            getComputedStyle(document.documentElement)
              .getPropertyValue(property)
              .trim(),
          `--${probeToken}`),
      )
      .toBe("ready");
    await expect(page.locator("#root")).toBeVisible();
  } finally {
    await writeFile(stylesheetPath, originalStylesheet);
  }
});

test("a development React update keeps the preview rendered", async ({
  page,
}) => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "HMR is only available on the local Vite development server",
  );

  const hmrUpdates: string[] = [];
  const browserErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
    if (message.text().includes("[vite] hot updated:")) {
      hmrUpdates.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeVisible();

  const originalApp = await readFile(appPath, "utf8");
  const probeComment = "\n// ARTCOVR React HMR probe\n";

  try {
    await writeFile(appPath, `${originalApp}${probeComment}`);
    await expect
      .poll(() => hmrUpdates.some((message) => message.includes("/src/App.tsx")))
      .toBe(true);
    await expect(page.locator("#root")).toBeVisible();
    await expect
      .poll(() => page.locator("body").innerText())
      .toContain("ARTCOVR");
    expect(browserErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  } finally {
    await writeFile(appPath, originalApp);
  }
});
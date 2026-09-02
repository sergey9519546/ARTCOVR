import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const stylesheetPath = fileURLToPath(
  new URL("../../src/index.css", import.meta.url),
);

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
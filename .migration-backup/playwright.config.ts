import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.PLAYWRIGHT_PORT || 45180);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseUrl || `http://127.0.0.1:${port}`;
const browserChannel =
  process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "chrome" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ||
    join(tmpdir(), "artcovr-playwright-results"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    ...(browserChannel ? { channel: browserChannel } : {}),
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } }
      : {}),
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npx next dev --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING: "1",
          NEXT_PUBLIC_SITE_URL: baseURL,
        },
      },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const port = Number(process.env.PLAYWRIGHT_PORT || 45180);
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT || port + 1);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir:
    process.env.PLAYWRIGHT_OUTPUT_DIR ||
    join(tmpdir(), "artcovr-playwright-results"),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // HMR coverage edits source files, so every local and CI run must keep those
  // mutations isolated from the deterministic storefront journeys.
  workers: 1,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseUrl || `http://127.0.0.1:${port}`,
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: 'pnpm --filter @workspace/api-server run dev',
          env: {
            NODE_ENV: 'development',
            ARTCOVR_STOREFRONT_ORIGINS: `http://127.0.0.1:${port}`,
            ARTCOVR_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
            PORT: String(apiPort),
          },
          url: `http://127.0.0.1:${apiPort}/api/healthz`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: `pnpm exec vite --config vite.config.ts --host 127.0.0.1 --port ${port}`,
          env: {
            VITE_E2E_AUTH: '1',
            PLAYWRIGHT_API_URL: `http://127.0.0.1:${apiPort}`,
            PORT: String(port),
            BASE_PATH: '/',
          },
          url: `http://127.0.0.1:${port}`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

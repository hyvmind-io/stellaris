import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_STATE, E2E_PORT } from "./e2e/config";

const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: E2E_AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  // The seed runs before the server so the dev bindings open a fresh database.
  webServer: {
    command: `pnpm test:e2e:seed && pnpm exec next dev --turbopack --port ${E2E_PORT}`,
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      STELLARIS_E2E: "1",
      NEXT_PUBLIC_APP_URL: baseURL,
      PRIVATE_REGISTRY: "true",
      CF_ACCESS_AUTH_ENABLED: "false",
    },
  },
});

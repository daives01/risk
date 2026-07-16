import { defineConfig, devices } from "@playwright/test";

const smokeOrigin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: smokeOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["auth-setup"],
      testMatch: /.*\.e2e\.ts/,
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.SMOKE_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "bun run dev:web -- --host 0.0.0.0",
        url: smokeOrigin,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

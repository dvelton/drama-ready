import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://127.0.0.1:4387/drama-ready/",
    trace: "retain-on-failure",
    serviceWorkers: "block"
  },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: "npm run serve",
    env: { PORT: "4387" },
    url: "http://127.0.0.1:4387/drama-ready/",
    reuseExistingServer: false,
    timeout: 15_000
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } }
  ]
});

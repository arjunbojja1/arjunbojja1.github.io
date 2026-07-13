import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.mjs",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "https://arjunbojja1.github.io/",
    channel: "chrome",
    headless: true,
    permissions: ["notifications"],
    serviceWorkers: "allow",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

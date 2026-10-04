import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests drive the real panel against a running Vibe API.
 *   VIBE_API_URL=http://localhost:3000 ADMIN_E2E_PASSWORD=… npm run test:e2e
 * Uses the owner account (ADMIN_E2E_EMAIL, default owner@vibe.local) and
 * dev data (users created with scripts/demo-data.mjs).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.ADMIN_URL ?? "http://localhost:3001",
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

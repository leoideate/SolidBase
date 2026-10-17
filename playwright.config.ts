import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "./scripts/env";

loadEnv();
const PORT = 3100;

/**
 * Business acceptance tests T01–T08 (ARD section 7) against a dev server bound to the TEST
 * database, with its own build directory so it can run next to `pnpm dev`.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    // Production build: dev-mode on-demand compilation is too slow for reliable timings.
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 600_000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", NEXT_DIST_DIR: ".next-e2e" },
  },
});

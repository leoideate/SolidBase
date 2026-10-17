import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv } from "./scripts/env";

loadEnv();

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "", TZ: "UTC" },
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});

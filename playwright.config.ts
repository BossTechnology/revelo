import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Variables del Supabase local (`pnpm env:local`): las usan los tests y el servidor.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
// Secretos de prueba para el webhook de GitHub y el cron (el servidor de prueba los hereda).
process.env.GITHUB_WEBHOOK_SECRET ??= "secreto-webhook-e2e";
process.env.CRON_SECRET ??= "secreto-cron-e2e";

const port = 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // En CI se prueba el build de producción; en local, el servidor de desarrollo.
    command: process.env.CI
      ? `pnpm start --port ${port}`
      : `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

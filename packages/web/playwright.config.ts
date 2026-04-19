import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "cd ../server && bun -e 'import { startServer } from \"./src/server.ts\"; startServer({ port: 3000 })'",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      command: "bun run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  ],
});
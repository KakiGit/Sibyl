import { defineConfig, devices } from "@playwright/test";

const serverBindAddr = process.env.SIBYL_SERVER_BIND_ADDR || "localhost";
const serverBindPort = process.env.SIBYL_SERVER_BIND_PORT || "3000";
const webuiBindAddr = process.env.SIBYL_WEBUI_BIND_ADDR || "localhost";
const webuiBindPort = process.env.SIBYL_WEBUI_BIND_PORT || "5173";

const serverUrl = `http://${serverBindAddr}:${serverBindPort}`;
const webuiUrl = `http://${webuiBindAddr}:${webuiBindPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: webuiUrl,
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
      command: `cd ../server && bun -e 'import { startServer } from "./src/server.ts"; startServer({ port: ${serverBindPort}, host: "${serverBindAddr}" })'`,
      url: `${serverUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      command: "bun run dev",
      url: webuiUrl,
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  ],
});
import { defineConfig } from "@microsoft/tui-test";

export default defineConfig({
  retries: 2,
  trace: true,
  testDir: "tui-tests",
  timeout: 30000,
});
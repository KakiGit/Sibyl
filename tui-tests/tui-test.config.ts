import { defineConfig } from "@microsoft/tui-test";

export default defineConfig({
  retries: 2,
  trace: true,
  timeout: 15000,
});
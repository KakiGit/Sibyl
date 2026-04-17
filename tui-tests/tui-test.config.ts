import { defineConfig } from "@microsoft/tui-test";

export default defineConfig({
  retries: 2,
  trace: true,
  timeout: 60000,
  workers: 1,
  env: {
    PYTHONPATH: "/home/kaki/Github/Sibyl/python",
  },
});
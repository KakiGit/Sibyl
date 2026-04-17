import { test, expect } from "@microsoft/tui-test";

test.use({ 
  program: { 
    file: "/home/kaki/Github/Sibyl/target/release/sibyl",
    args: ["run", "--prompt", "hello"]
  },
  env: {
    TERM: "xterm-256color"
  },
  columns: 80,
  rows: 30,
  timeout: 60000
});

test("sibyl headless runs", async ({ terminal }) => {
  await expect(terminal.getByText("Response:")).toBeVisible({ timeout: 60000 });
});
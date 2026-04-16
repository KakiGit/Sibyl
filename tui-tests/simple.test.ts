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
  rows: 30
});

test("sibyl headless runs", async ({ terminal }) => {
  await expect(terminal.getByText("hello")).toBeVisible({ timeout: 30000 });
});
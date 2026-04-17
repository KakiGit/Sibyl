import { test, expect } from "@microsoft/tui-test";

test.use({
  program: {
    file: "/home/kaki/Github/Sibyl/target/release/sibyl",
    args: ["tui"]
  },
  env: {
    TERM: "xterm-256color"
  },
  columns: 120,
  rows: 30,
  timeout: 45000
});

test("sibyl tui SSE connection and deps status visible", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });
});

test("sibyl tui SSE connection established and deps visible", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });
});
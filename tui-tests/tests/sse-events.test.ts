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

test("sibyl tui status bar shows no-ses initially then ses prefix after message", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("no-ses")).toBeVisible({ timeout: 5000 });

  terminal.write("hello\r");

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("ses:")).toBeVisible({ timeout: 15000 });
});

test("sibyl tui SSE connection established and deps visible", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });
});
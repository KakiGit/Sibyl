import { test, expect } from "@microsoft/tui-test";

test.use({
  program: {
    file: "/home/kaki/Github/Sibyl/target/release/sibyl",
    args: ["tui"]
  },
  env: {
    TERM: "xterm-256color"
  },
  columns: 80,
  rows: 30
});

test("sibyl tui sends first message and shows You:", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("hello\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 10000 });
});

test("sibyl tui shows queued messages when busy", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("first\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 10000 });

  terminal.write("queued1\r");
  terminal.write("queued2\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui queue count increases with multiple messages", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("start\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 10000 });

  terminal.write("q1\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  terminal.write("q2\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui input clears after submit", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("test message\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 10000 });

  terminal.write("next");

  await expect(terminal.getByText("next")).toBeVisible({ timeout: 5000 });
});

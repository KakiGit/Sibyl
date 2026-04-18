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
  rows: 30,
  timeout: 60000
});

test("sibyl input shows typed text", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 15000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });
  terminal.write("Hello world");
  await expect(terminal.getByText("Hello world")).toBeVisible({ timeout: 5000 });
});

test("sibyl can send message and input stays responsive", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 15000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });

  terminal.write("First message\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 30000 });

  terminal.write("Second message");

  await expect(terminal.getByText("Second message")).toBeVisible({ timeout: 5000 });
});

test("sibyl shows processing after sending message", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 15000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 10000 });

  terminal.write("Test conversation\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });
});
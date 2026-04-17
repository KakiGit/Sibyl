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

test("sibyl tui sends message and shows user input", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });
  
  terminal.write("Hello world\r");
  
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui queues messages when busy", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });
  
  terminal.write("First message\r");
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });
  
  terminal.write("Queued one\r");
  terminal.write("Queued two\r");
  
  await expect(terminal.getByText("Queued (")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui displays queue panel with count", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });
  
  terminal.write("Processing start\r");
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });
  
  terminal.write("Queued A\r");
  terminal.write("Queued B\r");
  
  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui handles second message queued when busy", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });
  
  terminal.write("MsgAlpha\r");
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });
  
  terminal.write("MsgBeta\r");
  await expect(terminal.getByText("Queued (")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui input field accepts text", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 30000 });
  
  terminal.write("Test input text");
  
  await expect(terminal.getByText("Test input text")).toBeVisible({ timeout: 5000 });
});
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
  timeout: 30000
});

test("sibyl tui first message triggers processing state", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 15000 });
  
  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 5000 });
  
  terminal.write("hello\r");
  
  await expect(terminal.getByText("You: hello")).toBeVisible({ timeout: 5000 });
  
  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui queued messages appear while processing", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 15000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 5000 });

  terminal.write("message one\r");
  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("queued message\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });
});

test("sibyl tui shows You indicator for sent messages", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 15000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 5000 });

  terminal.write("first\r");
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });

  terminal.write("second\r");
  terminal.write("third\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });
});
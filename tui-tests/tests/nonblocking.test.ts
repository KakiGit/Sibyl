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
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 15000 });
  terminal.write("Hello world");
  await expect(terminal.getByText("Hello world")).toBeVisible({ timeout: 5000 });
});

test("sibyl can send message and input stays responsive", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 15000 });
  
  // Send first message
  terminal.write("First message\r");
  
  // Wait for response (shows conversation happened)
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 30000 });
  
  // Type second message - this proves input is responsive
  terminal.write("Second message");
  
  // Verify the second message text appears somewhere
  await expect(terminal.getByText("Second message")).toBeVisible({ timeout: 5000 });
});

test("sibyl shows processing after sending message", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 15000 });
  
  terminal.write("Test conversation\r");
  
  // Should show user message
  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 30000 });
  
  // Should show processing indicator (streaming or waiting)
  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });
});
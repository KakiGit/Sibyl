import { test, expect } from "@microsoft/tui-test";

test.use({ 
  program: { 
    file: "./target/release/sibyl",
    args: ["tui"]
  },
  env: {
    TERM: "xterm-256color"
  }
});

test("sibyl tui shows welcome screen", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
  await expect(terminal.getByText("Your memory-enhanced AI assistant")).toBeVisible();
});

test("sibyl tui shows keybindings in welcome", async ({ terminal }) => {
  await expect(terminal.getByText("Tab")).toBeVisible();
  await expect(terminal.getByText("memory panel")).toBeVisible();
  await expect(terminal.getByText("?")).toBeVisible();
  await expect(terminal.getByText("help")).toBeVisible();
});

test("sibyl tui shows command hints", async ({ terminal }) => {
  await expect(terminal.getByText("/help")).toBeVisible();
  await expect(terminal.getByText("/memory")).toBeVisible();
  await expect(terminal.getByText("/clear")).toBeVisible();
});

test("sibyl tui toggles help overlay", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
  
  terminal.write("?");
  await expect(terminal.getByText("Key Bindings")).toBeVisible();
  await expect(terminal.getByText("Enter")).toBeVisible();
  await expect(terminal.getByText("Send message")).toBeVisible();
  
  terminal.write("q");
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
});

test("sibyl tui toggles memory panel", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
  
  terminal.write("\t");
  await expect(terminal.getByText("Memory")).toBeVisible();
  
  terminal.write("\t");
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
});

test("sibyl tui opens command palette", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
  
  terminal.write(":");
  await expect(terminal.getByText("COMMAND")).toBeVisible();
  
  terminal.write("\x1b");
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible();
});

test("sibyl tui shows status bar with model", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible();
});
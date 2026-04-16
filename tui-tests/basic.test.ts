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

test("sibyl tui shows welcome screen", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 20000 });
});

test("sibyl tui shows keybindings in welcome", async ({ terminal }) => {
  await expect(terminal.getByText("Tab")).toBeVisible({ timeout: 20000 });
});

test("sibyl tui shows command hints", async ({ terminal }) => {
  await expect(terminal.getByText("/help")).toBeVisible({ timeout: 20000 });
});

test("sibyl tui toggles help overlay", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 20000 });
  
  terminal.write("?");
  await expect(terminal.getByText("Key Bindings")).toBeVisible();
});

test("sibyl tui toggles memory panel", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 20000 });
  
  terminal.write("\t");
  await expect(terminal.getByText("Memory")).toBeVisible();
});

test("sibyl tui opens command palette", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome")).toBeVisible({ timeout: 20000 });
  
  terminal.write(":");
  await expect(terminal.getByText("COMMAND")).toBeVisible();
});

test("sibyl tui shows status bar with model", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 20000 });
});
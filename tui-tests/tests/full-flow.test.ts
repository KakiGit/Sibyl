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
  timeout: 90000
});

test("sibyl tui complete flow: first message sent, response received, queued message processed", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("say 'one'\r");

  await expect(terminal.getByText("say 'one'")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'two'\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("one")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("two")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });
});

test("sibyl tui processes two queued messages", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("say 'FIRSTMSG'\r");

  await expect(terminal.getByText("FIRSTMSG")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'SECONDMSG'\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("FIRSTMSG")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("SECONDMSG")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });
});

test("sibyl tui queue panel appears with correct count", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  terminal.write("hello\r");

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("message1\r");
  terminal.write("message2\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 60000 });
});
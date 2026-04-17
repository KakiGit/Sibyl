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

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'two'\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Ready")).toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Queued")).not.toBeVisible({ timeout: 10000 });
});

test("sibyl tui processes multiple queued messages sequentially", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  terminal.write("reply with 'A'\r");

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });

  terminal.write("reply with 'B'\r");
  terminal.write("reply with 'C'\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Queued")).not.toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });
});

test("sibyl tui processes multiple queued messages sequentially from beginning", async ({ terminal }) => {
  await expect(terminal.getByText("Welcome to Sibyl")).toBeVisible({ timeout: 30000 });

  terminal.write("reply with 'A'\r");
  terminal.write("reply with 'B'\r");
  terminal.write("reply with 'C'\r");
  j

  await expect(terminal.getByText("You:")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Queued (3)")).toBeVisible({ timeout: 3000 });

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Queued")).not.toBeVisible({ timeout: 10000 });

  await expect(terminal.getByText("Sibyl:")).toBeVisible({ timeout: 60000 });
});

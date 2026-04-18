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
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 30000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'ALPHA123'\r");

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'BETA456'\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 60000 });
});

test("sibyl tui processes two queued messages", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 30000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'FIRSTUNIQUE'\r");

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("say 'SECONDUNIQUE'\r");

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 60000 });

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 60000 });
});

test("sibyl tui queue panel appears with correct count", async ({ terminal }) => {
  await expect(terminal.getByText("glm-5")).toBeVisible({ timeout: 30000 });
  await expect(terminal.getByText("deps")).toBeVisible({ timeout: 5000 });

  terminal.write("hello\r");

  await expect(terminal.getByText("Processing")).toBeVisible({ timeout: 5000 });

  terminal.write("message1\r");
  terminal.write("message2\r");

  await expect(terminal.getByText("Queued (2)")).toBeVisible({ timeout: 5000 });

  await expect(terminal.getByText("Queued (1)")).toBeVisible({ timeout: 60000 });
});
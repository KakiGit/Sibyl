import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";

interface QueueArgs {
  server?: string;
}

export async function runQueue(args: QueueArgs): Promise<void> {
  const spinner = ora("Fetching work queue status...").start();
  const serverUrl = args.server || process.env.SIBYL_SERVER || "http://localhost:3000";

  try {
    const response = await fetch(`${serverUrl}/api/work-queue/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      active: boolean;
      queueLength: number;
      currentItem: {
        id: string;
        operation: string;
        description: string;
        startedAt: number;
      } | null;
    };

    spinner.stop();

    console.log();
    console.log(chalk.bold("Work Queue Status"));
    console.log(chalk.dim("─".repeat(30)));
    
    const statusText = result.active ? chalk.green("Active") : chalk.gray("Inactive");
    console.log(`  Status:    ${statusText}`);
    console.log(`  Queue:     ${result.queueLength} task(s)`);
    
    if (result.currentItem) {
      console.log();
      console.log(chalk.bold("Current Task"));
      console.log(chalk.dim("─".repeat(30)));
      console.log(`  Operation: ${chalk.blue(result.currentItem.operation)}`);
      console.log(`  Desc:      ${result.currentItem.description}`);
      const elapsed = Math.round((Date.now() - result.currentItem.startedAt) / 1000);
      console.log(`  Elapsed:   ${elapsed}s`);
    }
    
    console.log();
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const queueCommand: CommandModule<{}, QueueArgs> = {
  command: "queue",
  describe: "Check LLM work queue status",
  builder: {
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runQueue,
};
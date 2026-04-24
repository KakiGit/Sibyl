import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface DeleteArgs {
  page?: string;
  resource?: string;
  force?: boolean;
  server?: string;
}

export async function runDelete(args: DeleteArgs): Promise<void> {
  const spinner = ora("Deleting...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    if (args.page) {
      const response = await fetch(`${serverUrl}/api/wiki-pages/${args.page}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string; message?: string };
        spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
        return;
      }

      spinner.succeed(chalk.green(`Wiki page "${args.page}" deleted`));
    } else if (args.resource) {
      const response = await fetch(`${serverUrl}/api/raw-resources/${args.resource}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string; message?: string };
        spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
        return;
      }

      spinner.succeed(chalk.green(`Raw resource "${args.resource}" deleted`));
    } else {
      spinner.fail(chalk.red("Either --page or --resource must be provided"));
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const deleteCommand: CommandModule<{}, DeleteArgs> = {
  command: "delete",
  describe: "Delete a wiki page or raw resource",
  builder: {
    page: {
      alias: "p",
      type: "string",
      describe: "Wiki page slug or ID to delete",
    },
    resource: {
      alias: "r",
      type: "string",
      describe: "Raw resource ID to delete",
    },
    force: {
      alias: "f",
      type: "boolean",
      describe: "Force deletion without confirmation",
      default: false,
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runDelete,
};
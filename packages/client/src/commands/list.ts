import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface ListArgs {
  type?: string;
  tags?: string;
  limit?: number;
  server?: string;
}

export async function runList(args: ListArgs): Promise<void> {
  const spinner = ora("Fetching wiki pages...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    const params = new URLSearchParams();
    if (args.type) params.set("type", args.type);
    if (args.tags) params.set("tags", args.tags);
    if (args.limit) params.set("limit", String(args.limit));

    const response = await fetch(`${serverUrl}/api/wiki-pages?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      data: Array<{
        id: string;
        slug: string;
        title: string;
        type: string;
        summary?: string;
        tags: string[];
        updatedAt: number;
      }>;
    };

    spinner.succeed(chalk.green(`Found ${result.data.length} pages`));

    if (result.data.length === 0) {
      console.log();
      console.log(chalk.yellow("No wiki pages found"));
      return;
    }

    console.log();
    for (const page of result.data) {
      const typeColor = page.type === "entity" ? chalk.blue : page.type === "concept" ? chalk.hex("#9333ea") : page.type === "source" ? chalk.green : chalk.hex("#f97316");
      console.log(`${typeColor(`[${page.type}]`)} ${chalk.bold(page.title)} [[${page.slug}]]`);
      if (page.summary) {
        console.log(`  ${chalk.dim(page.summary.slice(0, 80))}...`);
      }
      if (page.tags.length > 0) {
        console.log(`  ${chalk.dim("Tags:")} ${page.tags.join(", ")}`);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const listCommand: CommandModule<{}, ListArgs> = {
  command: "list",
  describe: "List wiki pages",
  builder: {
    type: {
      alias: "t",
      type: "string",
      describe: "Filter by page type (entity, concept, source, summary)",
    },
    tags: {
      alias: "g",
      type: "string",
      describe: "Filter by comma-separated tags",
    },
    limit: {
      alias: "l",
      type: "number",
      describe: "Maximum number of results",
      default: 20,
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runList,
};
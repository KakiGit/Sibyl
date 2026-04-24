import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface FileArgs {
  title: string;
  content?: string;
  type?: string;
  tags?: string;
  query?: string;
  server?: string;
}

export async function runFile(args: FileArgs): Promise<void> {
  const spinner = ora("Filing content...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    let endpoint = "/api/filing";
    let body: Record<string, unknown>;

    if (args.query) {
      endpoint = "/api/filing/query";
      body = {
        query: args.query,
        title: args.title,
        tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : undefined,
      };
    } else if (args.content) {
      body = {
        title: args.title,
        content: args.content,
        type: args.type,
        tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : undefined,
      };
    } else {
      spinner.fail(chalk.red("Either --content or --query must be provided"));
      return;
    }

    const response = await fetch(`${serverUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      data: {
        wikiPageId: string;
        slug: string;
        title: string;
        type: string;
        linkedPages?: string[];
      };
    };

    spinner.succeed(chalk.green("Content filed successfully"));
    console.log();
    console.log(chalk.bold("Result:"));
    console.log(`  ${chalk.dim("Wiki Page ID:")} ${result.data.wikiPageId}`);
    console.log(`  ${chalk.dim("Slug:")} ${result.data.slug}`);
    console.log(`  ${chalk.dim("Title:")} ${result.data.title}`);
    console.log(`  ${chalk.dim("Type:")} ${result.data.type}`);
    if (result.data.linkedPages && result.data.linkedPages.length > 0) {
      console.log(`  ${chalk.dim("Linked Pages:")} ${result.data.linkedPages.length}`);
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const fileCommand: CommandModule<{}, FileArgs> = {
  command: "file",
  describe: "File content or query result into the wiki",
  builder: {
    title: {
      alias: "t",
      type: "string",
      describe: "Title for the wiki page",
      demandOption: true,
    },
    content: {
      alias: "c",
      type: "string",
      describe: "Content to file",
    },
    type: {
      alias: "T",
      type: "string",
      describe: "Page type (entity, concept, source, summary)",
      default: "summary",
    },
    tags: {
      alias: "g",
      type: "string",
      describe: "Comma-separated tags",
    },
    query: {
      alias: "q",
      type: "string",
      describe: "Query to file result from",
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runFile,
};
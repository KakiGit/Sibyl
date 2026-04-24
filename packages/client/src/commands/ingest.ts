import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface IngestArgs {
  content: string;
  type?: string;
  title?: string;
  tags?: string;
  server?: string;
}

export async function runIngest(args: IngestArgs): Promise<void> {
  const spinner = ora("Ingesting content...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/api/ingest/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: args.content,
        type: args.type || "text",
        title: args.title,
        tags: args.tags ? args.tags.split(",").map((t) => t.trim()) : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      data: {
        rawResourceId: string;
        wikiPageId: string;
        slug: string;
        title: string;
        type: string;
        processed: boolean;
      };
    };

    spinner.succeed(chalk.green("Content ingested successfully"));
    console.log();
    console.log(chalk.bold("Result:"));
    console.log(`  ${chalk.dim("Raw Resource ID:")} ${result.data.rawResourceId}`);
    console.log(`  ${chalk.dim("Wiki Page ID:")} ${result.data.wikiPageId}`);
    console.log(`  ${chalk.dim("Slug:")} ${result.data.slug}`);
    console.log(`  ${chalk.dim("Title:")} ${result.data.title}`);
    console.log(`  ${chalk.dim("Type:")} ${result.data.type}`);
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const ingestCommand: CommandModule<{}, IngestArgs> = {
  command: "ingest",
  describe: "Ingest content into the memory system",
  builder: {
    content: {
      alias: "c",
      type: "string",
      describe: "Content text to ingest",
      demandOption: true,
    },
    type: {
      alias: "t",
      type: "string",
      describe: "Type of content (text, pdf, webpage)",
      default: "text",
    },
    title: {
      alias: "T",
      type: "string",
      describe: "Title for the wiki page",
    },
    tags: {
      alias: "g",
      type: "string",
      describe: "Comma-separated tags",
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runIngest,
};
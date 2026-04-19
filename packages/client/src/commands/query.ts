import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";

interface QueryArgs {
  query: string;
  type?: string;
  tags?: string;
  limit?: number;
  synthesize?: boolean;
  server?: string;
}

export async function runQuery(args: QueryArgs): Promise<void> {
  const spinner = ora("Searching wiki...").start();
  const serverUrl = args.server || process.env.SIBYL_SERVER || "http://localhost:3000";

  try {
    const endpoint = args.synthesize ? "/api/synthesize" : "/api/wiki-pages";
    const params = new URLSearchParams();
    params.set("query", args.query);
    if (args.type) params.set("type", args.type);
    if (args.tags) params.set("tags", args.tags);
    if (args.limit) params.set("limit", String(args.limit));

    const response = await fetch(`${serverUrl}${endpoint}?${params.toString()}`, {
      method: args.synthesize ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: args.synthesize ? JSON.stringify({ query: args.query }) : undefined,
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    spinner.succeed(chalk.green("Query completed"));

    if (args.synthesize) {
      const result = await response.json() as {
        data: {
          query: string;
          answer: string;
          citations: Array<{ pageSlug: string; pageTitle: string; relevanceScore: number }>;
          model?: string;
        };
      };
      console.log();
      console.log(chalk.bold("Answer:"));
      console.log(result.data.answer);
      if (result.data.citations.length > 0) {
        console.log();
        console.log(chalk.bold("Citations:"));
        for (const cite of result.data.citations) {
          console.log(`  [[${cite.pageSlug}]] - ${cite.pageTitle} (${cite.relevanceScore})`);
        }
      }
    } else {
      const result = await response.json() as {
        data: Array<{
          id: string;
          slug: string;
          title: string;
          type: string;
          summary?: string;
          tags: string[];
        }>;
      };
      console.log();
      if (result.data.length === 0) {
        console.log(chalk.yellow("No matching pages found"));
      } else {
        console.log(chalk.bold(`Found ${result.data.length} pages:`));
        for (const page of result.data) {
          console.log();
          console.log(`  ${chalk.cyan(page.title)} [[${page.slug}]]`);
          console.log(`  ${chalk.dim("Type:")} ${page.type}`);
          if (page.summary) {
            console.log(`  ${chalk.dim("Summary:")} ${page.summary.slice(0, 100)}...`);
          }
          if (page.tags.length > 0) {
            console.log(`  ${chalk.dim("Tags:")} ${page.tags.join(", ")}`);
          }
        }
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const queryCommand: CommandModule<{}, QueryArgs> = {
  command: "query",
  describe: "Query the wiki for information",
  builder: {
    query: {
      alias: "q",
      type: "string",
      describe: "Query string",
      demandOption: true,
    },
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
      default: 10,
    },
    synthesize: {
      alias: "s",
      type: "boolean",
      describe: "Synthesize an answer using LLM",
      default: false,
    },
    server: {
      alias: "S",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runQuery,
};
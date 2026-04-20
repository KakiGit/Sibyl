import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

interface ExportArgs {
  format?: string;
  type?: string;
  output?: string;
  includeLinks?: boolean;
  includeContent?: boolean;
  server?: string;
}

export async function runExport(args: ExportArgs): Promise<void> {
  const spinner = ora("Exporting wiki pages...").start();
  const serverUrl = args.server || process.env.SIBYL_SERVER || "http://localhost:3000";

  try {
    const params = new URLSearchParams();
    params.set("format", args.format || "json");
    if (args.type) params.set("type", args.type);
    params.set("includeLinks", String(args.includeLinks ?? true));
    params.set("includeContent", String(args.includeContent ?? true));

    const response = await fetch(`${serverUrl}/api/export?${params.toString()}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      data: {
        exportedAt: number;
        format: string;
        totalPages: number;
        pages?: Array<{
          id: string;
          slug: string;
          title: string;
          type: string;
          summary?: string;
          tags: string[];
          createdAt: number;
          updatedAt: number;
        }>;
        markdown?: string;
      };
    };

    const format = result.data.format;
    const totalPages = result.data.totalPages;
    const timestamp = new Date(result.data.exportedAt).toISOString().split("T")[0];

    let outputPath = args.output;
    let contentToWrite: string;

    if (format === "json") {
      outputPath = outputPath || `sibyl-export-${timestamp}.json`;
      contentToWrite = JSON.stringify(result.data, null, 2);
    } else {
      outputPath = outputPath || `sibyl-export-${timestamp}.md`;
      contentToWrite = result.data.markdown || "";
    }

    const absolutePath = resolve(outputPath);
    const dir = dirname(absolutePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(absolutePath, contentToWrite);

    spinner.succeed(chalk.green(`Exported ${totalPages} pages to ${absolutePath}`));

    if (totalPages > 0) {
      console.log();
      console.log(chalk.dim(`Format: ${format}`));
      if (args.type) {
        console.log(chalk.dim(`Type filter: ${args.type}`));
      }
      console.log(chalk.dim(`Include links: ${args.includeLinks ?? true}`));
      console.log(chalk.dim(`Include content: ${args.includeContent ?? true}`));
      
      if (format === "json" && result.data.pages) {
        console.log();
        console.log(chalk.bold("Exported pages:"));
        for (const page of result.data.pages.slice(0, 10)) {
          console.log(`  ${chalk.blue(`[${page.type}]`)} ${page.title} [[${page.slug}]]`);
        }
        if (result.data.pages.length > 10) {
          console.log(chalk.dim(`  ... and ${result.data.pages.length - 10} more`));
        }
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const exportCommand: CommandModule<{}, ExportArgs> = {
  command: "export",
  describe: "Export wiki pages to a file",
  builder: {
    format: {
      alias: "f",
      type: "string",
      describe: "Export format (json or markdown)",
      default: "json",
      choices: ["json", "markdown"],
    },
    type: {
      alias: "t",
      type: "string",
      describe: "Filter by page type (entity, concept, source, summary)",
    },
    output: {
      alias: "o",
      type: "string",
      describe: "Output file path",
    },
    includeLinks: {
      alias: "l",
      type: "boolean",
      describe: "Include wiki links in export",
      default: true,
    },
    includeContent: {
      alias: "c",
      type: "boolean",
      describe: "Include page content in export",
      default: true,
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runExport,
};
import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface LintArgs {
  fix?: boolean;
  server?: string;
}

export async function runLint(args: LintArgs): Promise<void> {
  const spinner = ora("Running wiki lint...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/api/lint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string; message?: string };
      spinner.fail(chalk.red(`Failed: ${error.error || error.message || response.statusText}`));
      return;
    }

    const result = await response.json() as {
      data: {
        totalPages: number;
        totalPagesWithIssues: number;
        issues: Array<{
          type: string;
          severity: string;
          pageSlug?: string;
          pageTitle?: string;
          details: string;
          suggestedAction?: string;
        }>;
        orphanPages: Array<{ slug: string; title: string }>;
        stalePages: Array<{ slug: string; title: string }>;
        suggestions: string[];
      };
    };

    if (result.data.totalPagesWithIssues === 0) {
      spinner.succeed(chalk.green(`Wiki is healthy (${result.data.totalPages} pages)`));
    } else {
      spinner.warn(chalk.yellow(`${result.data.totalPagesWithIssues} pages with issues found`));
    }

    console.log();
    console.log(chalk.bold("Lint Report:"));
    console.log(`  ${chalk.dim("Total Pages:")} ${result.data.totalPages}`);
    console.log(`  ${chalk.dim("Pages with Issues:")} ${result.data.totalPagesWithIssues}`);
    console.log(`  ${chalk.dim("Orphan Pages:")} ${result.data.orphanPages.length}`);
    console.log(`  ${chalk.dim("Stale Pages:")} ${result.data.stalePages.length}`);

    if (result.data.issues.length > 0) {
      console.log();
      console.log(chalk.bold("Issues:"));
      for (const issue of result.data.issues.slice(0, 10)) {
        const severityColor = issue.severity === "high" ? chalk.red : issue.severity === "medium" ? chalk.yellow : chalk.dim;
        console.log(`  ${severityColor(`[${issue.severity}]`)} ${issue.type}: ${issue.pageTitle || issue.pageSlug}`);
        console.log(`    ${chalk.dim(issue.details)}`);
        if (issue.suggestedAction) {
          console.log(`    ${chalk.dim("Action:")} ${issue.suggestedAction}`);
        }
      }
      if (result.data.issues.length > 10) {
        console.log(`  ${chalk.dim(`... and ${result.data.issues.length - 10} more issues`)}`);
      }
    }

    if (result.data.suggestions.length > 0) {
      console.log();
      console.log(chalk.bold("Suggestions:"));
      for (const suggestion of result.data.suggestions) {
        console.log(`  ${chalk.dim("-")} ${suggestion}`);
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const lintCommand: CommandModule<{}, LintArgs> = {
  command: "lint",
  describe: "Run wiki health check (lint)",
  builder: {
    fix: {
      alias: "f",
      type: "boolean",
      describe: "Attempt to fix issues automatically",
      default: false,
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runLint,
};
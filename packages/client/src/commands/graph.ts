import type { CommandModule } from "yargs";
import ora from "ora";
import chalk from "chalk";
import { getServerUrl } from "@sibyl/shared";

interface GraphArgs {
  page?: string;
  depth?: number;
  server?: string;
}

export async function runGraph(args: GraphArgs): Promise<void> {
  const spinner = ora("Fetching wiki graph...").start();
  const serverUrl = args.server || getServerUrl();

  try {
    const response = await fetch(`${serverUrl}/api/wiki-links/graph`, {
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
        nodes: Array<{
          id: string;
          slug: string;
          title: string;
          type: string;
          incomingLinks: number;
          outgoingLinks: number;
          isOrphan: boolean;
          isHub: boolean;
        }>;
        edges: Array<{
          from: string;
          to: string;
          relationType: string;
        }>;
        stats: {
          totalPages: number;
          totalLinks: number;
          orphanCount: number;
          hubCount: number;
        };
      };
    };

    spinner.succeed(chalk.green("Graph loaded"));

    console.log();
    console.log(chalk.bold("Wiki Graph Statistics:"));
    console.log(`  ${chalk.dim("Total Pages:")} ${result.data.stats.totalPages}`);
    console.log(`  ${chalk.dim("Total Links:")} ${result.data.stats.totalLinks}`);
    console.log(`  ${chalk.dim("Orphan Pages:")} ${result.data.stats.orphanCount}`);
    console.log(`  ${chalk.dim("Hub Pages:")} ${result.data.stats.hubCount}`);

    const hubNodes = result.data.nodes.filter((n) => n.isHub);
    const orphanNodes = result.data.nodes.filter((n) => n.isOrphan);

    if (hubNodes.length > 0) {
      console.log();
      console.log(chalk.bold("Hub Pages (most connected):"));
      for (const node of hubNodes.slice(0, 5)) {
        console.log(`  ${chalk.blue(node.title)} [[${node.slug}]]`);
        console.log(`    ${chalk.dim(`Incoming: ${node.incomingLinks}, Outgoing: ${node.outgoingLinks}`)}`);
      }
    }

    if (orphanNodes.length > 0) {
      console.log();
      console.log(chalk.bold("Orphan Pages (no connections):"));
      for (const node of orphanNodes.slice(0, 5)) {
        console.log(`  ${chalk.red(node.title)} [[${node.slug}]]`);
      }
      if (orphanNodes.length > 5) {
        console.log(`  ${chalk.dim(`... and ${orphanNodes.length - 5} more orphan pages`)}`);
      }
    }

    if (args.page) {
      const targetNode = result.data.nodes.find((n) => n.slug === args.page || n.id === args.page);
      if (targetNode) {
        console.log();
        console.log(chalk.bold(`Page: ${targetNode.title}`));
        const incoming = result.data.edges.filter((e) => e.to === targetNode.id);
        const outgoing = result.data.edges.filter((e) => e.from === targetNode.id);
        console.log(`  ${chalk.dim("Incoming Links:")} ${incoming.length}`);
        for (const edge of incoming.slice(0, args.depth || 5)) {
          const source = result.data.nodes.find((n) => n.id === edge.from);
          if (source) {
            console.log(`    ${chalk.cyan(source.title)} -> ${targetNode.title} (${edge.relationType})`);
          }
        }
        console.log(`  ${chalk.dim("Outgoing Links:")} ${outgoing.length}`);
        for (const edge of outgoing.slice(0, args.depth || 5)) {
          const target = result.data.nodes.find((n) => n.id === edge.to);
          if (target) {
            console.log(`    ${targetNode.title} -> ${chalk.cyan(target.title)} (${edge.relationType})`);
          }
        }
      } else {
        console.log(chalk.yellow(`Page "${args.page}" not found`));
      }
    }
  } catch (error) {
    spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
  }
}

export const graphCommand: CommandModule<{}, GraphArgs> = {
  command: "graph",
  describe: "View the wiki knowledge graph",
  builder: {
    page: {
      alias: "p",
      type: "string",
      describe: "Show connections for a specific page (by slug or id)",
    },
    depth: {
      alias: "d",
      type: "number",
      describe: "Depth of connections to show",
      default: 5,
    },
    server: {
      alias: "s",
      type: "string",
      describe: "Sibyl server URL",
    },
  },
  handler: runGraph,
};
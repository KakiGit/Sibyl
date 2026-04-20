import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ingestCommand } from "./commands/ingest.js";
import { queryCommand } from "./commands/query.js";
import { fileCommand } from "./commands/file.js";
import { lintCommand } from "./commands/lint.js";
import { graphCommand } from "./commands/graph.js";
import { listCommand } from "./commands/list.js";
import { deleteCommand } from "./commands/delete.js";
import { exportCommand } from "./commands/export.js";

const cli = yargs(hideBin(process.argv))
  .scriptName("sibyl")
  .usage("$0 <command> [options]")
  .version("0.1.0")
  .alias("v", "version")
  .help()
  .alias("h", "help")
  .command(ingestCommand)
  .command(queryCommand)
  .command(fileCommand)
  .command(lintCommand)
  .command(graphCommand)
  .command(listCommand)
  .command(deleteCommand)
  .command(exportCommand)
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .recommendCommands()
  .epilog("For more information, visit https://github.com/sibyl/sibyl");

cli.parse();
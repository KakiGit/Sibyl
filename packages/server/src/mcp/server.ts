import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMcpTools } from "./tools.js";
import { createDatabase, migrateDatabase, closeDatabase } from "../database.js";
import { DB_FILE } from "@sibyl/shared";
import { resolve } from "path";
import { logger } from "@sibyl/shared";

export interface McpServerOptions {
  dbPath?: string;
  name?: string;
  version?: string;
}

export function createMcpServer(options: McpServerOptions = {}): McpServer {
  const name = options.name || "sibyl";
  const version = options.version || "0.1.0";

  const server = new McpServer({
    name,
    version,
  });

  const dbPath = options.dbPath || resolve(DB_FILE);
  const db = createDatabase(dbPath);
  migrateDatabase(db);

  registerMcpTools(server);

  logger.info("MCP server initialized", { name, version });

  return server;
}

export async function startMcpServer(options: McpServerOptions = {}): Promise<void> {
  const server = createMcpServer(options);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info("MCP server started on stdio transport");

  process.on("SIGINT", async () => {
    await server.close();
    closeDatabase();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await server.close();
    closeDatabase();
    process.exit(0);
  });
}
import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes/index.js";
import { registerWebSocketRoutes } from "./websocket/index.js";
import { closeDatabase, migrateDatabase, createDatabase } from "./database.js";
import { syncDatabaseWithFiles } from "./sync.js";
import { DB_FILE } from "@sibyl/shared";
import { resolve, dirname } from "path";
import { existsSync } from "fs";

function findProjectRoot(): string {
  let currentDir = resolve(dirname(new URL(import.meta.url).pathname));
  
  while (currentDir !== dirname(currentDir)) {
    if (existsSync(resolve(currentDir, ".git")) || existsSync(resolve(currentDir, "package.json"))) {
      const rootPackageJson = resolve(currentDir, "package.json");
      try {
        const content = require("fs").readFileSync(rootPackageJson, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === "sibyl" || pkg.workspaces) {
          return currentDir;
        }
      } catch {}
    }
    currentDir = dirname(currentDir);
  }
  
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
}

export interface ServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
}

export async function createServer(options: ServerOptions = {}) {
  const fastify = Fastify({
    logger: process.env.LOG_LEVEL === "false" 
      ? false 
      : {
        level: process.env.LOG_LEVEL || "info",
      },
  });

  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await registerWebSocketRoutes(fastify);

  const projectRoot = findProjectRoot();
  const dbPath = options.dbPath || resolve(projectRoot, DB_FILE);
  fastify.log.info(`Using database at: ${dbPath}`);
  const db = createDatabase(dbPath);
  migrateDatabase(db);
  
  await syncDatabaseWithFiles(dbPath);

  await registerRoutes(fastify);

  fastify.addHook("onClose", async () => {
    closeDatabase();
  });

  return fastify;
}

export async function startServer(options: ServerOptions = {}) {
  const server = await createServer(options);
  const port = options.port || 3000;
  const host = options.host || "localhost";

  await server.listen({ port, host });
  
  server.log.info(`Sibyl Server running at http://${host}:${port}`);
  
  return server;
}

export async function stopServer(server: ReturnType<typeof Fastify>) {
  await server.close();
}
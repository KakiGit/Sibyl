import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes/index.js";
import { registerWebSocketRoutes } from "./websocket/index.js";
import { closeDatabase, migrateDatabase, createDatabase } from "./database.js";
import { syncDatabaseWithFiles } from "./sync.js";
import { DB_FILE, DEFAULT_SERVER_BIND_ADDR, DEFAULT_SERVER_BIND_PORT } from "@sibyl/shared";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { storage } from "./storage/index.js";
import { ingestWithLlm } from "./processors/ingest.js";
import { llmWorkQueue } from "./llm/work-queue.js";
import { logger } from "@sibyl/shared";

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
  const port = options.port || DEFAULT_SERVER_BIND_PORT;
  const host = options.host || DEFAULT_SERVER_BIND_ADDR;

  await server.listen({ port, host });
  
  server.log.info(`Sibyl Server running at http://${host}:${port}`);
  
  await recoverUnprocessedResources();
  
  return server;
}

async function recoverUnprocessedResources(): Promise<void> {
  try {
    const unprocessedResources = await storage.rawResources.findAll({
      processed: false,
      limit: 50,
    });

    if (unprocessedResources.length === 0) {
      logger.info("No unprocessed raw resources to recover");
      return;
    }

    logger.info(`Recovering ${unprocessedResources.length} unprocessed raw resources`);

    for (const resource of unprocessedResources) {
      llmWorkQueue.enqueue(
        "llm_ingest_recovery",
        `Recovering raw resource: ${resource.filename}`,
        async () => {
          try {
            const result = await ingestWithLlm({ rawResourceId: resource.id });
            logger.info("Recovered raw resource", {
              rawResourceId: resource.id,
              wikiPageId: result.wikiPageId,
              slug: result.slug,
            });
            return result;
          } catch (error) {
            logger.error("Failed to recover raw resource", {
              rawResourceId: resource.id,
              error: (error as Error).message,
            });
            throw error;
          }
        }
      );
    }
  } catch (error) {
    logger.error("Failed to recover unprocessed resources", {
      error: (error as Error).message,
    });
  }
}

export async function stopServer(server: ReturnType<typeof Fastify>) {
  await server.close();
}
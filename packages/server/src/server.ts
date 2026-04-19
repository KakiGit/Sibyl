import Fastify from "fastify";
import cors from "@fastify/cors";
import { registerRoutes } from "./routes/index.js";
import { closeDatabase, migrateDatabase, createDatabase } from "./database.js";
import { DB_FILE } from "@sibyl/shared";
import { resolve } from "path";

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

  const dbPath = options.dbPath || resolve(DB_FILE);
  const db = createDatabase(dbPath);
  migrateDatabase(db);

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
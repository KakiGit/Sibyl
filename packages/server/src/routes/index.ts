import type { FastifyInstance } from "fastify";
import { registerRawResourceRoutes } from "./raw-resources.js";
import { registerWikiPageRoutes } from "./wiki-pages.js";
import { registerWikiLinkRoutes } from "./wiki-links.js";
import { registerProcessingLogRoutes } from "./processing-log.js";
import { registerSynthesizeRoutes } from "./synthesize.js";
import { registerIngestRoutes } from "./ingest.js";
import { registerLintRoutes } from "./lint.js";

export async function registerRoutes(fastify: FastifyInstance) {
  await registerRawResourceRoutes(fastify);
  await registerWikiPageRoutes(fastify);
  await registerWikiLinkRoutes(fastify);
  await registerProcessingLogRoutes(fastify);
  await registerSynthesizeRoutes(fastify);
  await registerIngestRoutes(fastify);
  await registerLintRoutes(fastify);

  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: Date.now() };
  });
}
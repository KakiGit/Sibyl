import type { FastifyInstance } from "fastify";
import { registerRawResourceRoutes } from "./raw-resources.js";
import { registerWikiPageRoutes } from "./wiki-pages.js";
import { registerWikiLinkRoutes } from "./wiki-links.js";
import { registerProcessingLogRoutes } from "./processing-log.js";
import { registerSynthesizeRoutes } from "./synthesize.js";
import { registerIngestRoutes } from "./ingest.js";
import { registerLintRoutes } from "./lint.js";
import { registerFilingRoutes } from "./filing.js";
import { registerDocumentRoutes } from "./documents.js";
import { registerWikiMetaRoutes } from "./wiki-meta.js";
import { registerSchemaRoutes } from "./schema.js";
import { registerSearchRoutes } from "./search.js";
import { registerAuthRoutes } from "./auth.js";
import { requireAuth } from "../auth/middleware.js";

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", requireAuth({
    publicRoutes: [
      "/api/health",
      "/api/auth",
    ],
    skipAuthForHealth: true,
  }));

  await registerAuthRoutes(fastify);
  await registerRawResourceRoutes(fastify);
  await registerWikiPageRoutes(fastify);
  await registerWikiLinkRoutes(fastify);
  await registerProcessingLogRoutes(fastify);
  await registerSynthesizeRoutes(fastify);
  await registerIngestRoutes(fastify);
  await registerLintRoutes(fastify);
  await registerFilingRoutes(fastify);
  await registerDocumentRoutes(fastify);
  await registerWikiMetaRoutes(fastify);
  await registerSchemaRoutes(fastify);
  await registerSearchRoutes(fastify);

  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: Date.now() };
  });
}
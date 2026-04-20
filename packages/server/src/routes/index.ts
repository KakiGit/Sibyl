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
import { registerRawIndexRoutes } from "./raw-index.js";
import { registerWikiPageVersionsRoutes } from "./wiki-page-versions.js";
import { registerExportRoutes } from "./export.js";
import { registerWikiImportRoutes } from "./wiki-import.js";
import { registerMarpRoutes } from "./marp.js";
import { registerWikiStatsRoutes } from "./wiki-stats.js";
import { requireAuth } from "../auth/middleware.js";
import { getWebSocketStats } from "../websocket/index.js";

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", requireAuth({
    publicRoutes: [
      "/api/health",
      "/api/auth",
      "/ws",
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
  await registerRawIndexRoutes(fastify);
  await registerWikiPageVersionsRoutes(fastify);
  await registerExportRoutes(fastify);
  await registerWikiImportRoutes(fastify);
  await registerMarpRoutes(fastify);
  await registerWikiStatsRoutes(fastify);

  fastify.get("/api/health", async () => {
    return { status: "ok", timestamp: Date.now() };
  });

  fastify.get("/api/websocket/stats", async () => {
    return getWebSocketStats();
  });
}
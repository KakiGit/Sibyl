import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";

const LogQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  operation: z.enum(["ingest", "query", "filing", "lint"]).optional(),
});

export interface WikiMetaRouteOptions {
  wikiFileManager?: WikiFileManager;
}

export async function registerWikiMetaRoutes(
  fastify: FastifyInstance,
  options?: WikiMetaRouteOptions
) {
  const wikiManager = options?.wikiFileManager || wikiFileManager;

  fastify.get("/api/wiki-log", async (request, reply) => {
    const query = LogQuerySchema.safeParse(request.query);
    
    if (!query.success) {
      reply.code(400);
      return { error: query.error.message };
    }

    const limit = query.data.limit;
    const operation = query.data.operation;
    
    let entries = wikiManager.readLog(limit);
    
    if (operation) {
      entries = entries.filter((e) => e.operation === operation);
    }
    
    return { data: entries };
  });

  fastify.get("/api/wiki-index", async () => {
    const entries = wikiManager.getIndex();
    return { data: entries };
  });

  fastify.post("/api/wiki-index/rebuild", async () => {
    wikiManager.rebuildIndex();
    const entries = wikiManager.getIndex();
    return { 
      data: entries,
      message: "Wiki index rebuilt successfully",
    };
  });
}
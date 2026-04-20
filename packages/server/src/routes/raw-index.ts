import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rawResourceFileManager } from "../raw/index.js";
import { storage } from "../storage/index.js";
import { logger } from "@sibyl/shared";

const RebuildIndexSchema = z.object({});

export async function registerRawIndexRoutes(fastify: FastifyInstance) {
  fastify.get("/api/raw-index", async () => {
    const index = rawResourceFileManager.readIndex();
    
    return {
      data: {
        version: index.version,
        updatedAt: index.updatedAt,
        totalResources: index.totalResources,
        stats: index.stats,
        entries: index.entries,
        indexPath: rawResourceFileManager.getIndexPath(),
      },
    };
  });

  fastify.get("/api/raw-index/stats", async () => {
    const stats = rawResourceFileManager.getStats();
    
    return {
      data: {
        stats,
        indexPath: rawResourceFileManager.getIndexPath(),
      },
    };
  });

  fastify.get("/api/raw-index/unprocessed", async () => {
    const entries = rawResourceFileManager.findUnprocessed();
    
    return {
      data: {
        unprocessedCount: entries.length,
        entries,
      },
    };
  });

  fastify.get("/api/raw-index/:type", async (request, reply) => {
    const typeSchema = z.enum(["pdf", "image", "webpage", "text"]);
    const parseResult = typeSchema.safeParse((request.params as { type: string }).type);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid resource type. Must be one of: pdf, image, webpage, text" };
    }
    
    const entries = rawResourceFileManager.findByType(parseResult.data);
    
    return {
      data: {
        type: parseResult.data,
        count: entries.length,
        entries,
      },
    };
  });

  fastify.post("/api/raw-index/rebuild", async () => {
    const allResources = await storage.rawResources.findAll({ limit: 500 });
    
    rawResourceFileManager.rebuildIndex(allResources);
    
    logger.info("Rebuilt raw resource index from database", { 
      totalResources: allResources.length 
    });
    
    return {
      data: {
        success: true,
        totalResources: allResources.length,
        updatedAt: Date.now(),
        message: "Raw resource index rebuilt successfully",
      },
    };
  });
}
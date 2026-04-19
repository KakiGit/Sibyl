import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { OperationSchema } from "@sibyl/sdk";

const CreateProcessingLogSchema = z.object({
  operation: OperationSchema,
  rawResourceId: z.string().optional(),
  wikiPageId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const QueryProcessingLogSchema = z.object({
  operation: OperationSchema.optional(),
  rawResourceId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export async function registerProcessingLogRoutes(fastify: FastifyInstance) {
  fastify.get("/api/processing-log", async (request) => {
    const query = QueryProcessingLogSchema.parse(request.query);
    
    if (query.operation) {
      const logs = await storage.processingLog.findByOperation(query.operation);
      return { data: logs.slice(0, query.limit) };
    }
    
    if (query.rawResourceId) {
      const logs = await storage.processingLog.findByRawResourceId(query.rawResourceId);
      return { data: logs.slice(0, query.limit) };
    }
    
    const logs = await storage.processingLog.recent(query.limit);
    return { data: logs };
  });

  fastify.post("/api/processing-log", async (request, reply) => {
    const parseResult = CreateProcessingLogSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const log = await storage.processingLog.create(parseResult.data);
    return { data: log };
  });
}
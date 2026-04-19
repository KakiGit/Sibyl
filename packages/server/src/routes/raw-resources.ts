import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { RawResourceTypeSchema } from "@sibyl/sdk";

const CreateRawResourceSchema = z.object({
  type: RawResourceTypeSchema,
  filename: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  contentPath: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const UpdateRawResourceSchema = z.object({
  filename: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional().nullable(),
  contentPath: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  processed: z.boolean().optional(),
});

const QueryRawResourcesSchema = z.object({
  type: RawResourceTypeSchema.optional(),
  processed: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export async function registerRawResourceRoutes(fastify: FastifyInstance) {
  fastify.get("/api/raw-resources", async (request) => {
    const query = QueryRawResourcesSchema.parse(request.query);
    const resources = await storage.rawResources.findAll(query);
    return { data: resources };
  });

  fastify.get("/api/raw-resources/count", async (request) => {
    const query = QueryRawResourcesSchema.parse(request.query);
    const count = await storage.rawResources.count(query);
    return { count };
  });

  fastify.get("/api/raw-resources/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const resource = await storage.rawResources.findById(params.id);
    
    if (!resource) {
      reply.code(404);
      return { error: "Raw resource not found" };
    }
    
    return { data: resource };
  });

  fastify.post("/api/raw-resources", async (request, reply) => {
    const parseResult = CreateRawResourceSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const resource = await storage.rawResources.create(parseResult.data);
    return { data: resource };
  });

  fastify.put("/api/raw-resources/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = UpdateRawResourceSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const { sourceUrl, ...rest } = parseResult.data;
    const updateData = {
      ...rest,
      sourceUrl: sourceUrl ?? undefined,
    };
    
    const resource = await storage.rawResources.update(params.id, updateData);
    
    if (!resource) {
      reply.code(404);
      return { error: "Raw resource not found" };
    }
    
    return { data: resource };
  });

  fastify.delete("/api/raw-resources/:id", async (request, reply) => {
    const params = request.params as { id: string };
    
    const existing = await storage.rawResources.findById(params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Raw resource not found" };
    }
    
    await storage.rawResources.delete(params.id);
    return { success: true };
  });
}
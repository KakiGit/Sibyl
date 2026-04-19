import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";

const CreateWikiLinkSchema = z.object({
  fromPageId: z.string().min(1),
  toPageId: z.string().min(1),
  relationType: z.string().min(1),
});

export async function registerWikiLinkRoutes(fastify: FastifyInstance) {
  fastify.get("/api/wiki-links/from/:pageId", async (request, reply) => {
    const params = request.params as { pageId: string };
    const page = await storage.wikiPages.findById(params.pageId);
    
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const links = await storage.wikiLinks.findByFromPageId(params.pageId);
    return { data: links };
  });

  fastify.get("/api/wiki-links/to/:pageId", async (request, reply) => {
    const params = request.params as { pageId: string };
    const page = await storage.wikiPages.findById(params.pageId);
    
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const links = await storage.wikiLinks.findByToPageId(params.pageId);
    return { data: links };
  });

  fastify.post("/api/wiki-links", async (request, reply) => {
    const parseResult = CreateWikiLinkSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const body = parseResult.data;
    const fromPage = await storage.wikiPages.findById(body.fromPageId);
    const toPage = await storage.wikiPages.findById(body.toPageId);
    
    if (!fromPage || !toPage) {
      reply.code(400);
      return { error: "Source or target page not found" };
    }
    
    const link = await storage.wikiLinks.create(body);
    return { data: link };
  });

  fastify.delete("/api/wiki-links/:id", async (request) => {
    const params = request.params as { id: string };
    
    await storage.wikiLinks.delete(params.id);
    return { success: true };
  });
}
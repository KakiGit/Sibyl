import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiSearchStorage } from "../search/index.js";
import { searchCache } from "../cache/index.js";

const HybridSearchSchema = z.object({
  query: z.string().min(1),
  type: z.enum(["entity", "concept", "source", "summary"]).optional(),
  tags: z.string().optional(),
  useSemantic: z.coerce.boolean().optional(),
  semanticThreshold: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

const PAGES_CACHE_KEY = "search_pages";
const PAGES_CACHE_TTL = 60000;

async function getPagesForSearch() {
  const cached = searchCache.get(PAGES_CACHE_KEY);
  if (cached) {
    return cached;
  }
  
  const pages = await storage.wikiPages.findAll({ limit: 200 });
  searchCache.set(PAGES_CACHE_KEY, pages, PAGES_CACHE_TTL);
  return pages;
}

export async function registerSearchRoutes(fastify: FastifyInstance) {
  fastify.post("/api/wiki-pages/search", async (request, reply) => {
    const parseResult = HybridSearchSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    const body = parseResult.data;
    const tagsArray = body.tags
      ? body.tags.split(",").filter(Boolean)
      : undefined;
    
    const pages = await getPagesForSearch();
    
    const results = await wikiSearchStorage.hybridSearch(
      {
        query: body.query,
        type: body.type,
        tags: tagsArray,
        useSemantic: body.useSemantic ?? true,
        semanticThreshold: body.semanticThreshold ?? 0.3,
        limit: body.limit ?? 10,
      },
      pages
    );
    
    return { data: results };
  });
  
  fastify.get("/api/wiki-pages/search", async (request) => {
    const query = HybridSearchSchema.parse(request.query);
    const tagsArray = query.tags
      ? query.tags.split(",").filter(Boolean)
      : undefined;
    
    const pages = await getPagesForSearch();
    
    const results = await wikiSearchStorage.hybridSearch(
      {
        query: query.query,
        type: query.type,
        tags: tagsArray,
        useSemantic: query.useSemantic ?? true,
        semanticThreshold: query.semanticThreshold ?? 0.3,
        limit: query.limit ?? 10,
      },
      pages
    );
    
    return { data: results };
  });
  
  fastify.post("/api/wiki-pages/search/rebuild-index", async () => {
    searchCache.delete(PAGES_CACHE_KEY);
    const pages = await storage.wikiPages.findAll({ limit: 500 });
    await wikiSearchStorage.rebuildIndex(pages);
    return { data: { indexed: pages.length } };
  });
  
  fastify.post("/api/wiki-pages/search/invalidate-cache", async () => {
    searchCache.delete(PAGES_CACHE_KEY);
    return { success: true };
  });
}
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";

const CreateWikiLinkSchema = z.object({
  fromPageId: z.string().min(1),
  toPageId: z.string().min(1),
  relationType: z.string().min(1),
});

interface GraphNode {
  id: string;
  slug: string;
  title: string;
  type: string;
  incomingLinks: number;
  outgoingLinks: number;
  isOrphan: boolean;
  isHub: boolean;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relationType: string;
}

interface WikiGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalPages: number;
    totalLinks: number;
    orphanCount: number;
    hubCount: number;
  };
}

export async function registerWikiLinkRoutes(fastify: FastifyInstance) {
  fastify.get("/api/wiki-links/graph", async () => {
    const pages = await storage.wikiPages.findAll({ limit: 200 });
    const allLinks = [];
    
    for (const page of pages) {
      const outgoing = await storage.wikiLinks.findByFromPageId(page.id);
      allLinks.push(...outgoing);
    }

    const incomingCounts: Record<string, number> = {};
    const outgoingCounts: Record<string, number> = {};

    for (const link of allLinks) {
      incomingCounts[link.toPageId] = (incomingCounts[link.toPageId] || 0) + 1;
      outgoingCounts[link.fromPageId] = (outgoingCounts[link.fromPageId] || 0) + 1;
    }

    const nodes: GraphNode[] = pages.map((page) => {
      const incoming = incomingCounts[page.id] || 0;
      const outgoing = outgoingCounts[page.id] || 0;
      const isOrphan = incoming === 0 && outgoing === 0;
      const isHub = incoming >= 3 || outgoing >= 3;

      return {
        id: page.id,
        slug: page.slug,
        title: page.title,
        type: page.type,
        incomingLinks: incoming,
        outgoingLinks: outgoing,
        isOrphan,
        isHub,
      };
    });

    const edges: GraphEdge[] = allLinks.map((link) => ({
      id: link.id,
      from: link.fromPageId,
      to: link.toPageId,
      relationType: link.relationType,
    }));

    const orphanCount = nodes.filter((n) => n.isOrphan).length;
    const hubCount = nodes.filter((n) => n.isHub).length;

    const graph: WikiGraph = {
      nodes,
      edges,
      stats: {
        totalPages: pages.length,
        totalLinks: allLinks.length,
        orphanCount,
        hubCount,
      },
    };

    return { data: graph };
  });

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
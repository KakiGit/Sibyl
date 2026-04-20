import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";
import { WikiPageTypeSchema } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";

const ExportQuerySchema = z.object({
  format: z.enum(["json", "markdown"]).default("json"),
  type: WikiPageTypeSchema.optional(),
  includeLinks: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return true;
      if (val === "false" || val === "0") return false;
      return true;
    },
    z.boolean()
  ),
  includeContent: z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === "") return true;
      if (val === "false" || val === "0") return false;
      return true;
    },
    z.boolean()
  ),
});

export interface ExportedWikiPage {
  id: string;
  slug: string;
  title: string;
  type: string;
  summary?: string;
  tags: string[];
  sourceIds: string[];
  createdAt: number;
  updatedAt: number;
  version: number;
  content?: string;
  links?: {
    incoming: Array<{ fromSlug: string; relationType: string }>;
    outgoing: Array<{ toSlug: string; relationType: string }>;
  };
}

export interface ExportResult {
  exportedAt: number;
  format: "json" | "markdown";
  totalPages: number;
  pages: ExportedWikiPage[];
}

function generateMarkdownBundle(pages: ExportedWikiPage[]): string {
  const lines: string[] = [];
  
  lines.push("# Sibyl Wiki Export\n");
  lines.push(`Exported: ${new Date().toISOString()}\n`);
  lines.push(`Total Pages: ${pages.length}\n`);
  lines.push("\n---\n\n");
  
  for (const page of pages) {
    lines.push(`\n## [[${page.slug}]] - ${page.title}\n\n`);
    lines.push(`**Type:** ${page.type}\n`);
    lines.push(`**ID:** ${page.id}\n`);
    if (page.summary) {
      lines.push(`**Summary:** ${page.summary}\n`);
    }
    if (page.tags.length > 0) {
      lines.push(`**Tags:** ${page.tags.join(", ")}\n`);
    }
    if (page.links) {
      if (page.links.incoming.length > 0) {
        lines.push(`**Incoming Links:** ${page.links.incoming.map(l => `[[${l.fromSlug}]]`).join(", ")}\n`);
      }
      if (page.links.outgoing.length > 0) {
        lines.push(`**Outgoing Links:** ${page.links.outgoing.map(l => `[[${l.toSlug}]]`).join(", ")}\n`);
      }
    }
    lines.push(`**Created:** ${new Date(page.createdAt).toISOString()}\n`);
    lines.push(`**Updated:** ${new Date(page.updatedAt).toISOString()}\n`);
    
    if (page.content) {
      lines.push("\n### Content\n\n");
      lines.push(page.content);
      lines.push("\n");
    }
    
    lines.push("\n---\n");
  }
  
  return lines.join("");
}

export async function registerExportRoutes(fastify: FastifyInstance) {
  fastify.get("/api/export", async (request) => {
    const query = ExportQuerySchema.parse(request.query);
    
    const dbPages = await storage.wikiPages.findAll({
      type: query.type,
      limit: 1000,
    });
    
    const pageIdToSlug = new Map<string, string>();
    for (const page of dbPages) {
      pageIdToSlug.set(page.id, page.slug);
    }
    
    const exportedPages: ExportedWikiPage[] = [];
    
    for (const page of dbPages) {
      const exported: ExportedWikiPage = {
        id: page.id,
        slug: page.slug,
        title: page.title,
        type: page.type,
        summary: page.summary,
        tags: page.tags || [],
        sourceIds: page.sourceIds || [],
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        version: page.version || 1,
      };
      
      if (query.includeContent) {
        const pageContent = wikiFileManager.readPage(page.type, page.slug);
        exported.content = pageContent?.content || "";
      }
      
      if (query.includeLinks) {
        const incomingLinks = await storage.wikiLinks.findByToPageId(page.id);
        const outgoingLinks = await storage.wikiLinks.findByFromPageId(page.id);
        
        exported.links = {
          incoming: incomingLinks.map((link) => ({
            fromSlug: pageIdToSlug.get(link.fromPageId) || link.fromPageId,
            relationType: link.relationType,
          })),
          outgoing: outgoingLinks.map((link) => ({
            toSlug: pageIdToSlug.get(link.toPageId) || link.toPageId,
            relationType: link.relationType,
          })),
        };
      }
      
      exportedPages.push(exported);
    }
    
    const result: ExportResult = {
      exportedAt: Date.now(),
      format: query.format,
      totalPages: exportedPages.length,
      pages: exportedPages,
    };
    
    logger.info("Wiki exported", {
      format: query.format,
      totalPages: exportedPages.length,
      type: query.type || "all",
    });
    
    if (query.format === "markdown") {
      return {
        data: {
          exportedAt: result.exportedAt,
          format: result.format,
          totalPages: result.totalPages,
          markdown: generateMarkdownBundle(exportedPages),
        },
      };
    }
    
    return { data: result };
  });
  
  fastify.get("/api/export/stats", async () => {
    const totalPages = await storage.wikiPages.count();
    const allLinks = await storage.wikiLinks.findAllLinks();
    const totalRawResources = await storage.rawResources.count();
    
    const typeCounts: Record<string, number> = {};
    for (const page of await storage.wikiPages.findAll({ limit: 1000 })) {
      typeCounts[page.type] = (typeCounts[page.type] || 0) + 1;
    }
    
    return {
      data: {
        totalPages,
        totalLinks: allLinks.length,
        totalRawResources,
        types: typeCounts,
        canExport: totalPages > 0,
      },
    };
  });
}
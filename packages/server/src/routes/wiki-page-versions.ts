import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";

const VersionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const UpdateWithReasonSchema = z.object({
  changedBy: z.string().optional(),
  changeReason: z.string().optional(),
});

export async function registerWikiPageVersionsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/wiki-pages/:id/versions", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
    });
    
    const parseResult = paramsSchema.safeParse(request.params);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid wiki page ID" };
    }
    
    const { id } = parseResult.data;
    
    const page = await storage.wikiPages.findById(id);
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const queryParseResult = VersionHistoryQuerySchema.safeParse(request.query);
    const options = queryParseResult.success ? queryParseResult.data : {};
    
    const versions = await storage.wikiPageVersions.findByWikiPageId(id, options);
    
    return {
      data: {
        wikiPageId: id,
        currentVersion: page.version,
        totalVersions: await storage.wikiPageVersions.count(id),
        versions: versions.map((v) => ({
          id: v.id,
          version: v.version,
          title: v.title,
          summary: v.summary,
          tags: v.tags,
          changedBy: v.changedBy,
          changeReason: v.changeReason,
          createdAt: v.createdAt,
          createdAtDate: new Date(v.createdAt).toISOString(),
        })),
      },
    };
  });

  fastify.get("/api/wiki-pages/:id/versions/:version", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
      version: z.coerce.number().int().positive(),
    });
    
    const parseResult = paramsSchema.safeParse(request.params);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid wiki page ID or version" };
    }
    
    const { id, version } = parseResult.data;
    
    const page = await storage.wikiPages.findById(id);
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const versionRecord = await storage.wikiPageVersions.findByWikiPageIdAndVersion(id, version);
    if (!versionRecord) {
      reply.code(404);
      return { error: `Version ${version} not found for wiki page ${id}` };
    }
    
    return {
      data: {
        wikiPageId: id,
        version: versionRecord.version,
        title: versionRecord.title,
        summary: versionRecord.summary,
        tags: versionRecord.tags,
        contentSnapshot: versionRecord.contentSnapshot,
        changedBy: versionRecord.changedBy,
        changeReason: versionRecord.changeReason,
        createdAt: versionRecord.createdAt,
        createdAtDate: new Date(versionRecord.createdAt).toISOString(),
      },
    };
  });

  fastify.post("/api/wiki-pages/:id/restore/:version", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
      version: z.coerce.number().int().positive(),
    });
    
    const parseResult = paramsSchema.safeParse(request.params);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid wiki page ID or version" };
    }
    
    const { id, version } = parseResult.data;
    
    const page = await storage.wikiPages.findById(id);
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const versionRecord = await storage.wikiPageVersions.findByWikiPageIdAndVersion(id, version);
    if (!versionRecord) {
      reply.code(404);
      return { error: `Version ${version} not found for wiki page ${id}` };
    }
    
    const bodyParseResult = UpdateWithReasonSchema.safeParse(request.body);
    const restoreOptions = bodyParseResult.success ? bodyParseResult.data : {};
    
    wikiFileManager.updatePage({
      title: versionRecord.title,
      type: page.type,
      slug: page.slug,
      content: versionRecord.contentSnapshot,
      summary: versionRecord.summary,
      tags: versionRecord.tags,
      sourceIds: page.sourceIds,
      createdAt: page.createdAt,
      updatedAt: Date.now(),
    });
    
    const updatedPage = await storage.wikiPages.update(id, {
      title: versionRecord.title,
      summary: versionRecord.summary,
      tags: versionRecord.tags,
    }, {
      changedBy: restoreOptions.changedBy,
      changeReason: restoreOptions.changeReason ?? `Restored from version ${version}`,
    });
    
    return {
      data: {
        success: true,
        wikiPageId: id,
        restoredFromVersion: version,
        currentVersion: updatedPage?.version,
        title: updatedPage?.title,
        message: `Wiki page restored from version ${version}`,
      },
    };
  });

  fastify.get("/api/wiki-pages/:id/versions/diff/:version1/:version2", async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string(),
      version1: z.coerce.number().int().positive(),
      version2: z.coerce.number().int().positive(),
    });
    
    const parseResult = paramsSchema.safeParse(request.params);
    if (!parseResult.success) {
      reply.code(400);
      return { error: "Invalid wiki page ID or version numbers" };
    }
    
    const { id, version1, version2 } = parseResult.data;
    
    const page = await storage.wikiPages.findById(id);
    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }
    
    const v1Record = await storage.wikiPageVersions.findByWikiPageIdAndVersion(id, version1);
    const v2Record = await storage.wikiPageVersions.findByWikiPageIdAndVersion(id, version2);
    
    if (!v1Record || !v2Record) {
      reply.code(404);
      return { error: "One or both versions not found" };
    }
    
    const diff = computeSimpleDiff(v1Record.contentSnapshot, v2Record.contentSnapshot);
    
    return {
      data: {
        wikiPageId: id,
        version1: {
          version: v1Record.version,
          title: v1Record.title,
          createdAt: v1Record.createdAt,
        },
        version2: {
          version: v2Record.version,
          title: v2Record.title,
          createdAt: v2Record.createdAt,
        },
        diff,
      },
    };
  });
}

function computeSimpleDiff(content1: string, content2: string): {
  additions: number;
  deletions: number;
  unchangedLines: number;
  changes: { type: "added" | "removed" | "unchanged"; line: string }[];
} {
  const lines1 = content1.split("\n");
  const lines2 = content2.split("\n");
  
  const changes: { type: "added" | "removed" | "unchanged"; line: string }[] = [];
  const additions = lines2.length - lines1.length;
  const deletions = lines1.length > lines2.length ? lines1.length - lines2.length : 0;
  
  const maxLen = Math.max(lines1.length, lines2.length);
  
  for (let i = 0; i < maxLen; i++) {
    if (i < lines1.length && i < lines2.length) {
      if (lines1[i] === lines2[i]) {
        changes.push({ type: "unchanged", line: lines1[i] });
      } else {
        changes.push({ type: "removed", line: lines1[i] });
        changes.push({ type: "added", line: lines2[i] });
      }
    } else if (i < lines1.length) {
      changes.push({ type: "removed", line: lines1[i] });
    } else {
      changes.push({ type: "added", line: lines2[i] });
    }
  }
  
  const unchangedLines = changes.filter((c) => c.type === "unchanged").length;
  
  return {
    additions: Math.max(0, additions),
    deletions,
    unchangedLines,
    changes: changes.slice(0, 100),
  };
}
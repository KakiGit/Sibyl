import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { ingestRawResource, ingestUnprocessedResources, reingestRawResource, ingestWithLlm } from "../processors/ingest.js";
import { wikiFileManager } from "../wiki/index.js";
import { WikiPageTypeSchema } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";
import { getLlmProvider } from "../llm/index.js";

const IngestSingleSchema = z.object({
  rawResourceId: z.string().min(1),
  title: z.string().optional(),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  autoProcess: z.boolean().optional(),
});

const IngestBatchSchema = z.object({
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export async function registerIngestRoutes(fastify: FastifyInstance) {
  fastify.post("/api/ingest", async (request, reply) => {
    const parseResult = IngestSingleSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const result = await ingestRawResource({
        rawResourceId: body.rawResourceId,
        title: body.title,
        type: body.type,
        tags: body.tags,
        autoProcess: body.autoProcess,
        wikiFileManager,
      });

      logger.info("Ingested raw resource via API", {
        rawResourceId: body.rawResourceId,
        wikiPageId: result.wikiPageId,
        slug: result.slug,
      });

      return {
        data: {
          rawResourceId: result.rawResourceId,
          wikiPageId: result.wikiPageId,
          slug: result.slug,
          title: result.title,
          type: result.type,
          processed: result.processed,
        },
      };
    } catch (error) {
      logger.error("Ingest failed", {
        rawResourceId: body.rawResourceId,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest raw resource", message: (error as Error).message };
    }
  });

  fastify.post("/api/ingest/batch", async (request, reply) => {
    const parseResult = IngestBatchSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const result = await ingestUnprocessedResources({
        type: body.type,
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("Batch ingest completed via API", {
        processed: result.processed.length,
        failed: result.failed.length,
        total: result.total,
      });

      return {
        data: {
          processed: result.processed.map((p) => ({
            rawResourceId: p.rawResourceId,
            wikiPageId: p.wikiPageId,
            slug: p.slug,
            title: p.title,
            type: p.type,
          })),
          failed: result.failed,
          total: result.total,
        },
      };
    } catch (error) {
      logger.error("Batch ingest failed", { error: (error as Error).message });
      reply.code(500);
      return { error: "Failed to batch ingest", message: (error as Error).message };
    }
  });

  fastify.post("/api/ingest/reingest/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      const result = await reingestRawResource(params.id, { wikiFileManager });

      logger.info("Reingested raw resource via API", {
        rawResourceId: params.id,
        wikiPageId: result.wikiPageId,
      });

      return {
        data: {
          rawResourceId: result.rawResourceId,
          wikiPageId: result.wikiPageId,
          slug: result.slug,
          title: result.title,
          type: result.type,
          processed: result.processed,
        },
      };
    } catch (error) {
      logger.error("Reingest failed", {
        rawResourceId: params.id,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to reingest", message: (error as Error).message };
    }
  });

  fastify.post("/api/ingest/text", async (request, reply) => {
    const bodySchema = z.object({
      filename: z.string().min(1),
      content: z.string().min(1),
      title: z.string().optional(),
      type: WikiPageTypeSchema.optional(),
      tags: z.array(z.string()).optional(),
      sourceUrl: z.string().url().optional(),
    });

    const parseResult = bodySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;
    const { writeFileSync, existsSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const slug = body.filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const tempDir = join(tmpdir(), "sibyl-ingest");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const contentPath = join(tempDir, `${slug}.txt`);
    writeFileSync(contentPath, body.content);

    try {
      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: body.filename,
        contentPath,
        sourceUrl: body.sourceUrl,
        metadata: {
          title: body.title,
          tags: body.tags,
          contentLength: body.content.length,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: body.title,
        type: body.type,
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("Ingested text content via API", {
        filename: body.filename,
        wikiPageId: ingestResult.wikiPageId,
        contentLength: body.content.length,
      });

      return {
        data: {
          rawResourceId: ingestResult.rawResourceId,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
        },
      };
    } catch (error) {
      logger.error("Text ingest failed", {
        filename: body.filename,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest text", message: (error as Error).message };
    }
  });

  fastify.get("/api/ingest/status", async () => {
    const unprocessedCount = await storage.rawResources.count({ processed: false });
    const processedCount = await storage.rawResources.count({ processed: true });
    const totalCount = await storage.rawResources.count();

    return {
      data: {
        unprocessed: unprocessedCount,
        processed: processedCount,
        total: totalCount,
      },
    };
  });

  fastify.post("/api/ingest/llm", async (request, reply) => {
    const bodySchema = z.object({
      filename: z.string().min(1),
      content: z.string().min(1),
      title: z.string().optional(),
      type: WikiPageTypeSchema.optional(),
      tags: z.array(z.string()).optional(),
    });

    const parseResult = bodySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;
    const { writeFileSync, existsSync, mkdirSync } = await import("fs");
    const { join } = await import("path");
    const { tmpdir } = await import("os");

    const slug = body.filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const tempDir = join(tmpdir(), "sibyl-ingest");
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const contentPath = join(tempDir, `${slug}.txt`);
    writeFileSync(contentPath, body.content);

    const llmProvider = getLlmProvider();
    if (!llmProvider) {
      reply.code(503);
      return { error: "LLM provider not configured. Check ~/.llm_secrets file." };
    }

    try {
      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: body.filename,
        contentPath,
        metadata: {
          title: body.title,
          tags: body.tags,
          contentLength: body.content.length,
        },
      });

      const ingestResult = await ingestWithLlm({
        rawResourceId: rawResource.id,
        title: body.title,
        type: body.type,
        tags: body.tags,
        wikiFileManager,
        llmProvider,
      });

      logger.info("Ingested content with LLM via API", {
        filename: body.filename,
        wikiPageId: ingestResult.wikiPageId,
        crossReferences: ingestResult.generatedContent.crossReferences.length,
        model: llmProvider.getConfig().model,
      });

      return {
        data: {
          rawResourceId: ingestResult.rawResourceId,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
          crossReferences: ingestResult.generatedContent.crossReferences,
          llmGenerated: true,
        },
      };
    } catch (error) {
      logger.error("LLM ingest failed", {
        filename: body.filename,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest with LLM", message: (error as Error).message };
    }
  });
}
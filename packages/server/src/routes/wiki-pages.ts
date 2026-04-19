import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";
import { WikiPageTypeSchema } from "@sibyl/sdk";

const CreateWikiPageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  type: WikiPageTypeSchema,
  contentPath: z.string().min(1),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
});

const UpdateWikiPageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  title: z.string().min(1).optional(),
  type: WikiPageTypeSchema.optional(),
  contentPath: z.string().min(1).optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  sourceIds: z.array(z.string()).optional(),
  embeddingId: z.string().optional(),
});

const QueryWikiPagesSchema = z.object({
  type: WikiPageTypeSchema.optional(),
  tags: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export async function registerWikiPageRoutes(fastify: FastifyInstance) {
  fastify.get("/api/wiki-pages", async (request) => {
    const query = QueryWikiPagesSchema.parse(request.query);
    const tagsArray = query.tags
      ? query.tags.split(",").filter(Boolean)
      : undefined;
    const pages = await storage.wikiPages.findAll({
      ...query,
      tags: tagsArray,
    });
    return { data: pages };
  });

  fastify.get("/api/wiki-pages/count", async (request) => {
    const query = QueryWikiPagesSchema.parse(request.query);
    const tagsArray = query.tags
      ? query.tags.split(",").filter(Boolean)
      : undefined;
    const count = await storage.wikiPages.count({
      ...query,
      tags: tagsArray,
    });
    return { count };
  });

  fastify.get("/api/wiki-pages/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const page = await storage.wikiPages.findById(params.id);

    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    return { data: page };
  });

  fastify.get("/api/wiki-pages/slug/:slug", async (request, reply) => {
    const params = request.params as { slug: string };
    const page = await storage.wikiPages.findBySlug(params.slug);

    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    return { data: page };
  });

  fastify.post("/api/wiki-pages", async (request, reply) => {
    const parseResult = CreateWikiPageSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;
    const existing = await storage.wikiPages.findBySlug(body.slug);
    if (existing) {
      reply.code(400);
      return { error: "Wiki page with this slug already exists" };
    }

    const page = await storage.wikiPages.create(body);
    return { data: page };
  });

  fastify.put("/api/wiki-pages/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = UpdateWikiPageSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const page = await storage.wikiPages.update(params.id, parseResult.data);

    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    return { data: page };
  });

  fastify.delete("/api/wiki-pages/:id", async (request, reply) => {
    const params = request.params as { id: string };

    const existing = await storage.wikiPages.findById(params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    await storage.wikiPages.delete(params.id);
    wikiFileManager.deletePage(existing.type, existing.slug);
    return { success: true };
  });

  fastify.get("/api/wiki-pages/:id/content", async (request, reply) => {
    const params = request.params as { id: string };
    const page = await storage.wikiPages.findById(params.id);

    if (!page) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    const pageContent = wikiFileManager.readPage(page.type, page.slug);

    if (!pageContent) {
      reply.code(404);
      return { error: "Wiki page content not found" };
    }

    return { data: pageContent };
  });

  const UpdateWikiPageContentSchema = z.object({
    content: z.string().min(1),
    title: z.string().min(1).optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
  });

  fastify.put("/api/wiki-pages/:id/content", async (request, reply) => {
    const params = request.params as { id: string };
    const parseResult = UpdateWikiPageContentSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const existing = await storage.wikiPages.findById(params.id);
    if (!existing) {
      reply.code(404);
      return { error: "Wiki page not found" };
    }

    const existingContent = wikiFileManager.readPage(
      existing.type,
      existing.slug,
    );
    if (!existingContent) {
      reply.code(404);
      return { error: "Wiki page content not found" };
    }

    const body = parseResult.data;
    const now = Date.now();

    const updatedPageContent = {
      title: body.title || existingContent.title,
      type: existingContent.type,
      slug: existingContent.slug,
      content: body.content,
      summary: body.summary || existingContent.summary,
      tags: body.tags || existingContent.tags,
      sourceIds: existingContent.sourceIds,
      createdAt: existingContent.createdAt,
      updatedAt: now,
    };

    wikiFileManager.updatePage(updatedPageContent);

    if (body.title && body.title !== existing.title) {
      await storage.wikiPages.update(params.id, {
        title: body.title,
        summary: updatedPageContent.summary,
        tags: updatedPageContent.tags,
      });
    }

    return { data: updatedPageContent };
  });
}

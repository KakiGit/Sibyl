import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateMarpSlides } from "../processors/marp.js";
import { getLlmProvider } from "../llm/index.js";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";

const MarpRequestSchema = z.object({
  pageIds: z.array(z.string()).optional(),
  pageSlugs: z.array(z.string()).optional(),
  type: z.enum(["entity", "concept", "source", "summary"]).optional(),
  tags: z.array(z.string()).optional(),
  query: z.string().optional(),
  title: z.string().optional(),
  theme: z.enum(["default", "gaia", "uncover"]).optional().default("default"),
  paginate: z.boolean().optional().default(true),
  useLlm: z.boolean().optional().default(false),
  maxPages: z.number().int().positive().max(20).optional().default(10),
});

export async function registerMarpRoutes(fastify: FastifyInstance) {
  fastify.post("/api/marp", async (request, reply) => {
    const body = MarpRequestSchema.parse(request.body);

    const llmProvider = body.useLlm ? getLlmProvider() : null;

    if (body.useLlm && !llmProvider) {
      return reply.status(400).send({
        message: "LLM not configured. Set ~/.llm_secrets or environment variables (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)",
      });
    }

    try {
      const result = await generateMarpSlides({
        pageIds: body.pageIds,
        pageSlugs: body.pageSlugs,
        type: body.type,
        tags: body.tags,
        query: body.query,
        title: body.title,
        theme: body.theme,
        paginate: body.paginate,
        useLlm: body.useLlm,
        maxPages: body.maxPages,
        llmProvider,
      });

      await storage.processingLog.create({
        operation: "query",
        details: {
          type: "marp-generation",
          slideCount: result.slides.length,
          sourcePageCount: result.sourcePages.length,
          theme: result.theme,
          useLlm: body.useLlm,
        },
      });

      return { data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate slides";
      return reply.status(500).send({ message });
    }
  });

  fastify.get("/api/marp/:slug", async (request, reply) => {
    const params = z.object({ slug: z.string() }).parse(request.params);
    const query = z.object({
      theme: z.enum(["default", "gaia", "uncover"]).optional().default("default"),
      paginate: z.coerce.boolean().optional().default(true),
      useLlm: z.coerce.boolean().optional().default(false),
    }).parse(request.query);

    const { slug } = params;
    const { theme, paginate, useLlm } = query;

    const page = await storage.wikiPages.findBySlug(slug);
    if (!page) {
      return reply.status(404).send({ message: `Wiki page not found: ${slug}` });
    }

    const llmProvider = useLlm ? getLlmProvider() : null;

    if (useLlm && !llmProvider) {
      return reply.status(400).send({
        message: "LLM not configured. Set ~/.llm_secrets or environment variables",
      });
    }

    try {
      const result = await generateMarpSlides({
        pageSlugs: [slug],
        title: page.title,
        theme,
        paginate,
        useLlm,
        llmProvider,
      });

      return { data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate slides";
      return reply.status(500).send({ message });
    }
  });

  fastify.post("/api/marp/file", async (request) => {
    const body = z.object({
      marpContent: z.string(),
      title: z.string(),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().default("summary"),
      tags: z.array(z.string()).optional().default([]),
    }).parse(request.body);

    const slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = await storage.wikiPages.findBySlug(slug);

    const wikiPageContent = {
      title: body.title,
      type: body.type,
      slug,
      content: body.marpContent,
      summary: `Marp slide deck: ${body.title}`,
      tags: body.tags,
      sourceIds: [],
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (existing) {
      wikiFileManager.updatePage(wikiPageContent);
      await storage.wikiPages.update(existing.id, {
        title: body.title,
        summary: wikiPageContent.summary,
        tags: body.tags,
      });
    } else {
      wikiFileManager.createPage(wikiPageContent);
      const dbPage = await storage.wikiPages.create({
        slug,
        title: body.title,
        type: body.type,
        contentPath: wikiFileManager.getPagePath(body.type, slug),
        summary: wikiPageContent.summary,
        tags: body.tags,
        sourceIds: [],
      });

      await storage.processingLog.create({
        operation: "filing",
        wikiPageId: dbPage.id,
        details: { title: body.title, type: body.type, format: "marp" },
      });
    }

    return {
      data: {
        id: existing?.id || "",
        slug,
        title: body.title,
        type: body.type,
        message: existing ? "Marp slide deck updated" : "Marp slide deck saved",
      },
    };
  });
}
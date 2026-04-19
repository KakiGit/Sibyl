import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { WikiPageTypeSchema } from "@sibyl/sdk";
import { fileContent, fileQueryResult, getFilingHistory } from "../processors/filing.js";
import { queryWiki } from "../processors/query.js";
import { wikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";

const FileContentSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  sourcePageIds: z.array(z.string()).optional(),
  summary: z.string().optional(),
});

const FileQueryResultSchema = z.object({
  query: z.string().min(1),
  types: z.array(WikiPageTypeSchema).optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().optional(),
  filingTags: z.array(z.string()).optional(),
  maxPages: z.coerce.number().int().positive().max(10).default(5).optional(),
});

const FilingHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export async function registerFilingRoutes(fastify: FastifyInstance) {
  fastify.post("/api/filing", async (request, reply) => {
    const parseResult = FileContentSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const result = await fileContent({
        title: body.title,
        content: body.content,
        type: body.type,
        tags: body.tags,
        sourcePageIds: body.sourcePageIds,
        summary: body.summary,
        wikiFileManager,
      });

      return { data: result };
    } catch (error) {
      logger.error("Filing failed", { error: (error as Error).message });
      reply.code(500);
      return { error: "Failed to file content", message: (error as Error).message };
    }
  });

  fastify.post("/api/filing/query", async (request, reply) => {
    const parseResult = FileQueryResultSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const queryResult = await queryWiki({
        query: body.query,
        types: body.types,
        tags: body.tags,
        limit: body.maxPages,
        includeContent: true,
        wikiFileManager,
      });

      if (queryResult.matches.length === 0) {
        reply.code(400);
        return { error: "No matching wiki pages found for this query" };
      }

      const filingResult = await fileQueryResult({
        queryResult,
        title: body.title,
        tags: body.filingTags,
        wikiFileManager,
      });

      return { data: filingResult };
    } catch (error) {
      logger.error("Query filing failed", { error: (error as Error).message });
      reply.code(500);
      return { error: "Failed to file query result", message: (error as Error).message };
    }
  });

  fastify.get("/api/filing/history", async (request) => {
    const query = FilingHistoryQuerySchema.safeParse(request.query);
    const limit = query.success ? query.data.limit : 10;

    const history = await getFilingHistory(limit);
    return { data: history };
  });
}
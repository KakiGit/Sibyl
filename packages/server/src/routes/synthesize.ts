import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { WikiPageTypeSchema } from "@sibyl/sdk";
import { synthesizeAnswer } from "../processors/query.js";
import { wikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";

const SynthesizeQuerySchema = z.object({
  query: z.string().min(1),
  types: z.array(WikiPageTypeSchema).optional(),
  tags: z.array(z.string()).optional(),
  maxPages: z.coerce.number().int().positive().max(10).default(5).optional(),
  skipLlm: z.coerce.boolean().optional(),
});

export async function registerSynthesizeRoutes(fastify: FastifyInstance) {
  fastify.post("/api/synthesize", async (request, reply) => {
    const parseResult = SynthesizeQuerySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const result = await synthesizeAnswer({
        query: body.query,
        types: body.types,
        tags: body.tags,
        maxPages: body.maxPages,
        wikiFileManager,
        skipLlm: body.skipLlm,
      });

      return {
        data: {
          query: result.query,
          answer: result.answer,
          citations: result.citations,
          synthesizedAt: result.synthesizedAt,
          model: result.model,
        },
      };
    } catch (error) {
      logger.error("Synthesis failed", { error: (error as Error).message });
      reply.code(500);
      return { error: "Failed to synthesize answer", message: (error as Error).message };
    }
  });

  fastify.post("/api/synthesize/stream", async (request, reply) => {
    const parseResult = SynthesizeQuerySchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const body = parseResult.data;

    try {
      reply.raw.write(`event: start\ndata: ${JSON.stringify({ query: body.query })}\n\n`);

      const result = await synthesizeAnswer({
        query: body.query,
        types: body.types,
        tags: body.tags,
        maxPages: body.maxPages,
        wikiFileManager,
        skipLlm: body.skipLlm,
      });

      reply.raw.write(`event: answer\ndata: ${JSON.stringify({ answer: result.answer })}\n\n`);
      reply.raw.write(`event: citations\ndata: ${JSON.stringify({ citations: result.citations })}\n\n`);
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ model: result.model })}\n\n`);
    } catch (error) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    }

    reply.raw.end();
  });
}
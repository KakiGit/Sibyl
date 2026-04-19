import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lintWiki, findOrphanPages, findStalePages, findMissingReferences, findPotentialConflicts, getLintHistory } from "../processors/lint.js";

const LintOptionsSchema = z.object({
  checkOrphans: z.coerce.boolean().optional(),
  checkStale: z.coerce.boolean().optional(),
  checkMissingReferences: z.coerce.boolean().optional(),
  checkPotentialConflicts: z.coerce.boolean().optional(),
  staleThresholdDays: z.coerce.number().int().positive().optional(),
});

const LintHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export async function registerLintRoutes(fastify: FastifyInstance) {
  fastify.post("/api/lint", async (request) => {
    const parseResult = LintOptionsSchema.safeParse(request.body);
    
    const options = parseResult.success ? parseResult.data : {};
    
    const report = await lintWiki(options);
    
    return { data: report };
  });

  fastify.get("/api/lint", async (request) => {
    const query = LintOptionsSchema.safeParse(request.query);
    
    const options = query.success ? query.data : {};
    
    const report = await lintWiki(options);
    
    return { data: report };
  });

  fastify.get("/api/lint/orphans", async () => {
    const pages = await findOrphanPages();
    return { data: pages };
  });

  fastify.get("/api/lint/stale", async (request) => {
    const query = z.object({
      thresholdDays: z.coerce.number().int().positive().optional(),
    }).safeParse(request.query);
    
    const thresholdDays = query.success ? query.data.thresholdDays : undefined;
    const pages = await findStalePages(thresholdDays);
    return { data: pages };
  });

  fastify.get("/api/lint/missing-references", async () => {
    const refs = await findMissingReferences();
    return { data: refs };
  });

  fastify.get("/api/lint/conflicts", async () => {
    const conflicts = await findPotentialConflicts();
    return { data: conflicts };
  });

  fastify.get("/api/lint/history", async (request) => {
    const query = LintHistoryQuerySchema.safeParse(request.query);
    const limit = query.success ? query.data.limit : 10;
    const history = await getLintHistory(limit);
    return { data: history };
  });
}
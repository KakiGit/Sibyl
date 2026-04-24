import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";
import { getLlmProvider } from "../llm/index.js";
import { enrichMatchesWithGraph, getNeighborSummaries, type GraphExpansionResult } from "../wiki/graph-traversal.js";
import { logger } from "@sibyl/shared";

export function registerMcpTools(server: McpServer) {
  server.tool(
    "memory_recall",
    "Search Wiki Pages and synthesize an answer using LLM. Retrieves correlated Wiki Pages and uses LLM to generate a synthesized response. Uses graph expansion to find related pages.",
    {
      query: z.string().describe("Search query to find relevant Wiki Pages"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Filter by wiki page type"),
      limit: z.number().int().positive().max(20).default(5).describe("Maximum number of Wiki Pages to retrieve"),
    },
    async ({ query, type, limit }) => {
      const pages = await storage.wikiPages.findAll({
        search: query,
        type,
        limit: limit * 2,
      });

      if (pages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No Wiki Pages found matching the query.",
            },
          ],
        };
      }

      const matches = pages.map((page) => ({
        page,
        relevanceScore: 50,
        matchType: "content" as const,
      }));

      let enrichedMatches: GraphExpansionResult[] = matches.map((m) => ({
        ...m,
        isExpanded: false,
        matchType: m.matchType as "title" | "summary" | "tags" | "content" | "expanded",
      }));
      try {
        enrichedMatches = await enrichMatchesWithGraph(matches, {
          neighborLimit: 3,
          hubBoostWeight: 0.3,
        });
      } catch (error) {
        logger.warn("Graph expansion failed in memory_recall", { error: (error as Error).message });
      }

      const finalPages = enrichedMatches.slice(0, limit);

      const pagesWithContent = finalPages.map((em) => {
        const content = wikiFileManager.readPage(em.page.type, em.page.slug);
        return {
          title: em.page.title,
          type: em.page.type,
          summary: em.page.summary || "",
          content: content?.content || "",
          isExpanded: em.isExpanded,
          expandedFrom: em.expandedFrom,
        };
      });

      const llmProvider = getLlmProvider();
      if (!llmProvider) {
        const summaries = pagesWithContent.map((p) => `${p.title}${p.isExpanded ? " (related)" : ""}: ${p.summary}`);
        return {
          content: [
            {
              type: "text",
              text: `Found ${pages.length} Wiki Pages (${enrichedMatches.filter((e) => e.isExpanded).length} via graph expansion):\n\n${summaries.join("\n\n")}`,
            },
          ],
        };
      }

      try {
        const neighborSummaries = await getNeighborSummaries(
          finalPages.filter((p) => !p.isExpanded).slice(0, 5).map((p) => p.page.id),
          3
        );

        const result = await llmProvider.call(
          "",
          `Given the following Wiki Pages, synthesize a comprehensive answer to the query: "${query}"

Wiki Pages:
${pagesWithContent.map((p, i) => `
[${i + 1}] ${p.title} (${p.type})${p.isExpanded ? " [related via graph]" : ""}
Summary: ${p.summary}
Content: ${p.content.slice(0, 1000)}
`).join("\n")}

${neighborSummaries.length > 0 ? `
Related Concepts (from linked pages):
${neighborSummaries.slice(0, 9).map((n) => `- ${n.page.title}: ${n.summary}`).join("\n")}
` : ""}

Provide a synthesized answer that combines information from these Wiki Pages. Be concise and factual.`
        );

        return {
          content: [
            {
              type: "text",
              text: result.content,
            },
          ],
        };
      } catch (error) {
        logger.error("Synthesis failed in memory_recall", { error: (error as Error).message });
        const summaries = pagesWithContent.map((p) => `${p.title}: ${p.summary}`);
        return {
          content: [
            {
              type: "text",
              text: `Found ${pages.length} Wiki Pages:\n\n${summaries.join("\n\n")}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "memory_list",
    "List all Wiki Pages in the memory database. Returns an index of all stored Wiki Pages.",
    {
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Filter by wiki page type"),
    },
    async ({ type }) => {
      const index = wikiFileManager.getIndex();
      const filtered = type ? index.filter((entry) => entry.type === type) : index;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(filtered, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_query",
    "Query Wiki Pages with a question. Retrieves from Wiki Pages only and returns relevant pages metadata. Uses graph expansion to find related pages.",
    {
      question: z.string().describe("Question to ask the knowledge base"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Filter by wiki page type"),
      limit: z.number().int().positive().max(20).default(10).describe("Maximum number of pages to return"),
      includeContent: z.boolean().optional().default(false).describe("Whether to include full page content in results"),
    },
    async ({ question, type, limit, includeContent }) => {
      const pages = await storage.wikiPages.findAll({
        search: question,
        type,
        limit: limit * 2,
      });

      const matches = pages.map((page) => ({
        page,
        relevanceScore: 50,
        matchType: "content" as const,
      }));

      let enrichedMatches: GraphExpansionResult[] = matches.map((m) => ({
        ...m,
        isExpanded: false,
        matchType: m.matchType as "title" | "summary" | "tags" | "content" | "expanded",
      }));
      try {
        enrichedMatches = await enrichMatchesWithGraph(matches, {
          neighborLimit: 3,
          hubBoostWeight: 0.3,
        });
      } catch (error) {
        logger.warn("Graph expansion failed in memory_query", { error: (error as Error).message });
      }

      const finalPages = enrichedMatches.slice(0, limit);

      await storage.processingLog.create({
        operation: "query",
        details: { 
          question, 
          type, 
          limit, 
          resultCount: finalPages.length, 
          expandedCount: finalPages.filter((m) => m.isExpanded).length,
        },
      });

      if (finalPages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                question,
                resultCount: 0,
                message: "No relevant Wiki Pages found in the knowledge base.",
                pages: [],
              }),
            },
          ],
        };
      }

      const results = finalPages.map((em) => {
        const content = includeContent ? wikiFileManager.readPage(em.page.type, em.page.slug)?.content : undefined;
        return {
          slug: em.page.slug,
          title: em.page.title,
          type: em.page.type,
          summary: em.page.summary,
          content: includeContent ? content : undefined,
          tags: em.page.tags,
          updatedAt: em.page.updatedAt,
          isExpanded: em.isExpanded,
          expandedFrom: em.expandedFrom,
          relevanceScore: em.relevanceScore,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              question,
              resultCount: finalPages.length,
              expandedCount: finalPages.filter((r) => r.isExpanded).length,
              message: `Found ${finalPages.length} relevant Wiki Pages (${finalPages.filter((r) => r.isExpanded).length} via graph expansion).`,
              pages: results,
            }),
          },
        ],
      };
    }
  );
}
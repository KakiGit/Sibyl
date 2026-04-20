import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";
import { getLlmProvider } from "../llm/index.js";
import { logger } from "@sibyl/shared";

export function registerMcpTools(server: McpServer) {
  server.tool(
    "memory_recall",
    "Search Wiki Pages and synthesize an answer using LLM. Retrieves correlated Wiki Pages and uses LLM to generate a synthesized response.",
    {
      query: z.string().describe("Search query to find relevant Wiki Pages"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Filter by wiki page type"),
      limit: z.number().int().positive().max(20).default(5).describe("Maximum number of Wiki Pages to retrieve"),
    },
    async ({ query, type, limit }) => {
      const pages = await storage.wikiPages.findAll({
        search: query,
        type,
        limit,
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

      const pagesWithContent = pages.map((page) => {
        const content = wikiFileManager.readPage(page.type, page.slug);
        return {
          title: page.title,
          type: page.type,
          summary: page.summary || "",
          content: content?.content || "",
        };
      });

      const llmProvider = getLlmProvider();
      if (!llmProvider) {
        const summaries = pagesWithContent.map((p) => `${p.title}: ${p.summary}`);
        return {
          content: [
            {
              type: "text",
              text: `Found ${pages.length} Wiki Pages (LLM not configured, returning summaries):\n\n${summaries.join("\n\n")}`,
            },
          ],
        };
      }

      try {
        const result = await llmProvider.call(
          "",
          `Given the following Wiki Pages, synthesize a comprehensive answer to the query: "${query}"

Wiki Pages:
${pagesWithContent.map((p, i) => `
[${i + 1}] ${p.title} (${p.type})
Summary: ${p.summary}
Content: ${p.content.slice(0, 1000)}
`).join("\n")}

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
    "Query Wiki Pages with a question. Retrieves from Wiki Pages only and returns relevant pages metadata.",
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
        limit,
      });

      await storage.processingLog.create({
        operation: "query",
        details: { question, type, limit, resultCount: pages.length },
      });

      if (pages.length === 0) {
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

      const results = pages.map((page) => {
        const content = includeContent ? wikiFileManager.readPage(page.type, page.slug)?.content : undefined;
        return {
          slug: page.slug,
          title: page.title,
          type: page.type,
          summary: page.summary,
          content: includeContent ? content : undefined,
          tags: page.tags,
          updatedAt: page.updatedAt,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              question,
              resultCount: pages.length,
              message: `Found ${pages.length} relevant Wiki Pages.`,
              pages: results,
            }),
          },
        ],
      };
    }
  );
}
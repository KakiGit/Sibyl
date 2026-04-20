import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";

export function registerMcpTools(server: McpServer) {
  server.tool(
    "memory_recall",
    "Search and retrieve memories from the wiki. Returns relevant wiki pages based on search query.",
    {
      query: z.string().describe("Search query to find relevant memories"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Filter by wiki page type"),
      limit: z.number().int().positive().max(20).default(5).describe("Maximum number of results to return"),
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
              text: "No memories found matching the query.",
            },
          ],
        };
      }

      const results = pages.map((page) => {
        const content = wikiFileManager.readPage(page.type, page.slug);
        return {
          slug: page.slug,
          title: page.title,
          type: page.type,
          summary: page.summary,
          content: content?.content || "",
          tags: page.tags,
          updatedAt: page.updatedAt,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_save",
    "Save new information to the wiki as a memory page. Creates or updates a wiki page.",
    {
      title: z.string().describe("Title of the memory page"),
      type: z.enum(["entity", "concept", "source", "summary"]).describe("Type of wiki page"),
      content: z.string().describe("Content to save in the wiki page"),
      summary: z.string().optional().describe("Brief summary of the content"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      sourceIds: z.array(z.string()).optional().describe("IDs of source raw resources"),
    },
    async ({ title, type, content, summary, tags, sourceIds }) => {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const existing = await storage.wikiPages.findBySlug(slug);
      const now = Date.now();

      const wikiPageContent = {
        title,
        type,
        slug,
        content,
        summary,
        tags: tags || [],
        sourceIds: sourceIds || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      if (existing) {
        wikiFileManager.updatePage(wikiPageContent);
        await storage.wikiPages.update(existing.id, {
          title,
          summary,
          tags: tags || [],
          sourceIds: sourceIds || [],
        });
      } else {
        wikiFileManager.createPage(wikiPageContent);
        const dbPage = await storage.wikiPages.create({
          slug,
          title,
          type,
          contentPath: wikiFileManager.getPagePath(type, slug),
          summary,
          tags: tags || [],
          sourceIds: sourceIds || [],
        });

        await storage.processingLog.create({
          operation: "ingest",
          wikiPageId: dbPage.id,
          details: { title, type, slug },
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              slug,
              title,
              type,
              message: existing ? "Memory updated successfully" : "Memory created successfully",
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_list",
    "List all wiki pages in the memory database. Returns an index of all stored memories.",
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
    "memory_delete",
    "Delete a wiki page from the memory database.",
    {
      slug: z.string().describe("Slug identifier of the page to delete"),
      type: z.enum(["entity", "concept", "source", "summary"]).describe("Type of the wiki page"),
    },
    async ({ slug, type }) => {
      const existing = await storage.wikiPages.findBySlug(slug);

      if (!existing) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Memory not found",
              }),
            },
          ],
        };
      }

      wikiFileManager.deletePage(type, slug);
      await storage.wikiPages.delete(existing.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              slug,
              message: "Memory deleted successfully",
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_log",
    "Get recent processing log entries showing what operations have been performed.",
    {
      limit: z.number().int().positive().max(20).default(10).describe("Maximum number of log entries to return"),
      operation: z.enum(["ingest", "query", "filing", "lint"]).optional().describe("Filter by operation type"),
    },
    async ({ limit, operation }) => {
      if (operation) {
        const logs = await storage.processingLog.findByOperation(operation);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(logs.slice(0, limit), null, 2),
            },
          ],
        };
      }

      const logs = await storage.processingLog.recent(limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(logs, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_raw_save",
    "Save a raw resource (text content) to the memory database for later processing.",
    {
      type: z.enum(["pdf", "image", "webpage", "text"]).describe("Type of raw resource"),
      filename: z.string().describe("Filename for the resource"),
      content: z.string().describe("Text content to save"),
      sourceUrl: z.string().url().optional().describe("Source URL if applicable"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Additional metadata"),
    },
    async ({ type, filename, content, sourceUrl, metadata }) => {
      const slug = filename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const contentPath = `data/raw/documents/${slug}.txt`;

      const resource = await storage.rawResources.create({
        type: type === "text" ? "text" : type,
        filename,
        contentPath,
        sourceUrl,
        metadata: {
          ...metadata,
          contentPreview: content.slice(0, 500),
        },
      });

      await storage.processingLog.create({
        operation: "ingest",
        rawResourceId: resource.id,
        details: { filename, type, contentLength: content.length },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              id: resource.id,
              filename,
              type,
              message: "Raw resource saved successfully",
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_ingest",
    "Ingest text content directly into the wiki. Creates a raw resource, processes it, and generates a wiki page immediately. Optionally uses LLM to enhance content with structured wiki format and cross-references.",
    {
      filename: z.string().describe("Filename for the ingested content"),
      content: z.string().describe("Text content to ingest and process"),
      title: z.string().optional().describe("Optional title for the wiki page (defaults to filename)"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Optional wiki page type (defaults to 'concept' for text)"),
      tags: z.array(z.string()).optional().describe("Optional tags for the wiki page"),
      useLlm: z.boolean().optional().default(false).describe("Use LLM to generate structured wiki content with cross-references"),
    },
    async ({ filename, content, title, type, tags, useLlm }) => {
      const { writeFileSync, existsSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { ingestRawResource, ingestWithLlm } = await import("../processors/ingest.js");
      const { getLlmProvider } = await import("../llm/index.js");

      const slug = filename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const tempDir = join(tmpdir(), "sibyl-mcp-ingest");
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const contentPath = join(tempDir, `${slug}.txt`);
      writeFileSync(contentPath, content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename,
        contentPath,
        metadata: {
          title,
          tags,
          contentLength: content.length,
        },
      });

      let ingestResult;
      let generatedContent;

      if (useLlm) {
        const llmProvider = getLlmProvider();
        if (!llmProvider) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "LLM not configured. Set ~/.llm_secrets or environment variables (LLM_BASE_URL, LLM_API_KEY, LLM_MODEL)",
                  message: "Cannot use LLM enhancement without LLM provider",
                }),
              },
            ],
          };
        }

        const result = await ingestWithLlm({
          rawResourceId: rawResource.id,
          title,
          type: type === "entity" || type === "concept" || type === "source" || type === "summary" ? type : undefined,
          tags,
          wikiFileManager,
          llmProvider,
          useLlm: true,
        });
        ingestResult = result;
        generatedContent = result.generatedContent;
      } else {
        ingestResult = await ingestRawResource({
          rawResourceId: rawResource.id,
          title,
          type: type === "entity" || type === "concept" || type === "source" || type === "summary" ? type : undefined,
          tags,
          wikiFileManager,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              rawResourceId: ingestResult.rawResourceId,
              wikiPageId: ingestResult.wikiPageId,
              slug: ingestResult.slug,
              title: ingestResult.title,
              type: ingestResult.type,
              processed: ingestResult.processed,
              llmEnhanced: useLlm,
              crossReferences: generatedContent?.crossReferences || [],
              message: useLlm 
                ? "Content ingested and wiki page created with LLM enhancement"
                : "Content ingested and wiki page created successfully",
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_query",
    "Query the knowledge base with a question. Searches wiki pages and returns relevant information to help answer the question.",
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
                message: "No relevant information found in the knowledge base.",
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
              message: `Found ${pages.length} relevant pages in the knowledge base.`,
              pages: results,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_filing",
    "File content or analysis as a new wiki page. Useful for saving valuable answers, comparisons, or analyses back into the knowledge base. Creates links to source pages.",
    {
      title: z.string().describe("Title for the wiki page to create"),
      content: z.string().describe("Content to file as the wiki page"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().default("summary").describe("Type of wiki page (defaults to 'summary')"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      sourcePageSlugs: z.array(z.string()).optional().describe("Slugs of existing wiki pages to link as sources"),
      summary: z.string().optional().describe("Brief summary of the content"),
    },
    async ({ title, content, type, tags, sourcePageSlugs, summary }) => {
      const { fileContent } = await import("../processors/filing.js");

      const sourcePageIds: string[] = [];
      const linkedSlugs: string[] = [];

      if (sourcePageSlugs && sourcePageSlugs.length > 0) {
        for (const slug of sourcePageSlugs) {
          const page = await storage.wikiPages.findBySlug(slug);
          if (page) {
            sourcePageIds.push(page.id);
            linkedSlugs.push(slug);
          }
        }
      }

      const result = await fileContent({
        title,
        content,
        type: type || "summary",
        tags: tags || [],
        sourcePageIds,
        wikiFileManager,
        summary,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              wikiPageId: result.wikiPageId,
              slug: result.slug,
              title: result.title,
              type: result.type,
              linkedPages: linkedSlugs,
              linkedCount: result.linkedPages.length,
              filedAt: result.filedAt,
              message: `Filed content as wiki page with ${result.linkedPages.length} linked source pages`,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "memory_filing_history",
    "Get history of recently filed wiki pages. Shows what content has been saved to the wiki through filing operations.",
    {
      limit: z.number().int().positive().max(20).default(10).describe("Maximum number of history entries to return"),
    },
    async ({ limit }) => {
      const { getFilingHistory } = await import("../processors/filing.js");

      const history = await getFilingHistory(limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              count: history.length,
              history: history.map((entry) => ({
                wikiPageId: entry.wikiPageId,
                title: entry.title,
                slug: entry.slug,
                filedAt: entry.filedAt,
                filedAtDate: new Date(entry.filedAt).toISOString(),
              })),
            }),
          },
        ],
      };
    }
  );
}
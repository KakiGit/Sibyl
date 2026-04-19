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
    "Ingest text content directly into the wiki. Creates a raw resource, processes it, and generates a wiki page immediately.",
    {
      filename: z.string().describe("Filename for the ingested content"),
      content: z.string().describe("Text content to ingest and process"),
      title: z.string().optional().describe("Optional title for the wiki page (defaults to filename)"),
      type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Optional wiki page type (defaults to 'concept' for text)"),
      tags: z.array(z.string()).optional().describe("Optional tags for the wiki page"),
    },
    async ({ filename, content, title, type, tags }) => {
      const { writeFileSync, existsSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { ingestRawResource } = await import("../processors/ingest.js");

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

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title,
        type: type === "entity" || type === "concept" || type === "source" || type === "summary" ? type : undefined,
        tags,
        wikiFileManager,
      });

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
              message: "Content ingested and wiki page created successfully",
            }),
          },
        ],
      };
    }
  );
}
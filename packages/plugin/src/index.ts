import type { Plugin, Hooks, ToolDefinition } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

export interface SibylPluginOptions {
  serverUrl?: string;
  dbPath?: string;
  autoInject?: boolean;
  apiKey?: string;
}

const DEFAULT_SERVER_URL = "http://localhost:3000";

async function fetchSibylApi(
  serverUrl: string,
  path: string,
  options?: { method?: string; body?: unknown; apiKey?: string }
): Promise<unknown> {
  const url = `${serverUrl}${path}`;
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.apiKey) {
    headers["x-api-key"] = options.apiKey;
  }
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Sibyl API error: ${response.status}`);
  }

  return response.json();
}

export const SibylPlugin: Plugin = async (input, options?: SibylPluginOptions) => {
  const serverUrl = options?.serverUrl || DEFAULT_SERVER_URL;
  const autoInject = options?.autoInject !== false;
  const apiKey = options?.apiKey;

  const hooks: Hooks = {
    tool: {
      memory_recall: tool({
        description:
          "Search and retrieve memories from the Sibyl knowledge base. Returns relevant wiki pages based on search query.",
        args: {
          query: tool.schema.string().describe("Search query to find relevant memories"),
          type: tool.schema
            .enum(["entity", "concept", "source", "summary"])
            .optional()
            .describe("Filter by wiki page type"),
          limit: tool.schema
            .number()
            .int()
            .positive()
            .max(20)
            .default(5)
            .describe("Maximum number of results to return"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          params.set("search", args.query);
          if (args.type) params.set("type", args.type);
          params.set("limit", String(args.limit || 5));

          const result = await fetchSibylApi(
            serverUrl,
            `/api/wiki-pages?${params.toString()}`,
            { apiKey }
          );

          const data = (result as { data?: unknown[] }).data || [];
          if (data.length === 0) {
            return "No memories found matching the query.";
          }

          const pages = data as Array<{
            slug: string;
            title: string;
            type: string;
            summary?: string;
            tags?: string[];
          }>;

          const formatted = pages.map((page) => {
            let output = `## ${page.title} (${page.type})\n`;
            output += `Slug: ${page.slug}\n`;
            if (page.summary) output += `Summary: ${page.summary}\n`;
            if (page.tags?.length) output += `Tags: ${page.tags.join(", ")}\n`;
            return output;
          });

          return formatted.join("\n---\n");
        },
      }),

      memory_save: tool({
        description:
          "Save new information to the Sibyl knowledge base. Creates or updates a wiki page.",
        args: {
          title: tool.schema.string().describe("Title of the memory page"),
          type: tool.schema
            .enum(["entity", "concept", "source", "summary"])
            .describe("Type of wiki page"),
          content: tool.schema.string().describe("Content to save in the wiki page"),
          summary: tool.schema.string().optional().describe("Brief summary of the content"),
          tags: tool.schema.array(tool.schema.string()).optional().describe("Tags for categorization"),
        },
        async execute(args, _context) {
          const slug = args.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

          const result = await fetchSibylApi(serverUrl, "/api/wiki-pages", {
            method: "POST",
            body: {
              slug,
              title: args.title,
              type: args.type,
              contentPath: `data/wiki/${args.type}/${slug}.md`,
              summary: args.summary,
              tags: args.tags || [],
              sourceIds: [],
            },
            apiKey,
          });

          const data = result as { id?: string; slug?: string };
          return `Memory saved successfully. ID: ${data.id || "unknown"}, Slug: ${data.slug || slug}`;
        },
      }),

      memory_list: tool({
        description:
          "List all wiki pages in the Sibyl knowledge base. Returns an index of all stored memories.",
        args: {
          type: tool.schema
            .enum(["entity", "concept", "source", "summary"])
            .optional()
            .describe("Filter by wiki page type"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          if (args.type) params.set("type", args.type);

          const result = await fetchSibylApi(
            serverUrl,
            `/api/wiki-pages?${params.toString()}`,
            { apiKey }
          );

          const data = (result as { data?: unknown[] }).data || [];
          const pages = data as Array<{
            slug: string;
            title: string;
            type: string;
            summary?: string;
          }>;

          if (pages.length === 0) {
            return "No memories found in the knowledge base.";
          }

          const formatted = pages.map((page) => {
            return `- ${page.title} (${page.type}) [${page.slug}]`;
          });

          return `Found ${pages.length} memories:\n${formatted.join("\n")}`;
        },
      }),

      memory_delete: tool({
        description: "Delete a wiki page from the Sibyl knowledge base.",
        args: {
          slug: tool.schema.string().describe("Slug identifier of the page to delete"),
        },
        async execute(args, _context) {
          const result = await fetchSibylApi(serverUrl, `/api/wiki-pages/${args.slug}`, {
            method: "DELETE",
            apiKey,
          });

          const data = result as { success?: boolean };
          return data.success
            ? `Memory deleted successfully: ${args.slug}`
            : "Failed to delete memory.";
        },
      }),

      memory_ingest: tool({
        description:
          "Ingest text content into the Sibyl knowledge base. Creates a raw resource and processes it.",
        args: {
          filename: tool.schema.string().describe("Filename for the ingested content"),
          content: tool.schema.string().describe("Text content to ingest"),
          type: tool.schema
            .enum(["pdf", "image", "webpage", "text"])
            .default("text")
            .describe("Type of content being ingested"),
        },
        async execute(args, _context) {
          const result = await fetchSibylApi(serverUrl, "/api/ingest/text", {
            method: "POST",
            body: {
              filename: args.filename,
              content: args.content,
              type: args.type || "text",
            },
            apiKey,
          });

          const data = result as {
            rawResourceId?: string;
            wikiPageId?: string;
            slug?: string;
          };

          return `Content ingested successfully. Raw resource ID: ${data.rawResourceId || "unknown"}, Wiki page ID: ${data.wikiPageId || "unknown"}`;
        },
      }),

      memory_query: tool({
        description:
          "Query the Sibyl knowledge base with a question. Searches wiki pages and synthesizes an answer.",
        args: {
          question: tool.schema.string().describe("Question to ask the knowledge base"),
          includeContent: tool.schema
            .boolean()
            .optional()
            .default(false)
            .describe("Whether to include full page content in results"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          params.set("search", args.question);
          params.set("limit", "10");

          const result = await fetchSibylApi(
            serverUrl,
            `/api/wiki-pages?${params.toString()}`,
            { apiKey }
          );

          const data = (result as { data?: unknown[] }).data || [];
          const pages = data as Array<{
            title: string;
            type: string;
            summary?: string;
            slug: string;
          }>;

          if (pages.length === 0) {
            return "No relevant information found in the knowledge base.";
          }

          const summaries = pages.map((page) => {
            return `${page.title}: ${page.summary || "No summary available"}`;
          });

          return `Based on ${pages.length} relevant pages:\n\n${summaries.join("\n\n")}`;
        },
      }),

      memory_log: tool({
        description:
          "Get recent processing log entries from Sibyl. Shows what operations have been performed.",
        args: {
          limit: tool.schema
            .number()
            .int()
            .positive()
            .max(20)
            .default(10)
            .describe("Maximum number of log entries to return"),
          operation: tool.schema
            .enum(["ingest", "query", "filing", "lint"])
            .optional()
            .describe("Filter by operation type"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          params.set("limit", String(args.limit || 10));
          if (args.operation) params.set("operation", args.operation);

          const result = await fetchSibylApi(
            serverUrl,
            `/api/processing-log?${params.toString()}`,
            { apiKey }
          );

          const data = (result as { data?: unknown[] }).data || [];
          const logs = data as Array<{
            id: string;
            operation: string;
            createdAt: number;
            details?: unknown;
          }>;

          if (logs.length === 0) {
            return "No processing log entries found.";
          }

          const formatted = logs.map((log) => {
            const date = new Date(log.createdAt).toISOString();
            return `- [${date}] ${log.operation}`;
          });

          return `Recent operations:\n${formatted.join("\n")}`;
        },
      }),

      memory_filing: tool({
        description:
          "File content or analysis as a new wiki page. Useful for saving valuable answers, comparisons, or analyses back into the knowledge base. Creates links to source pages.",
        args: {
          title: tool.schema.string().describe("Title for the wiki page to create"),
          content: tool.schema.string().describe("Content to file as the wiki page"),
          type: tool.schema
            .enum(["entity", "concept", "source", "summary"])
            .optional()
            .default("summary")
            .describe("Type of wiki page (defaults to 'summary')"),
          tags: tool.schema.array(tool.schema.string()).optional().describe("Tags for categorization"),
          sourcePageSlugs: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Slugs of existing wiki pages to link as sources"),
          summary: tool.schema.string().optional().describe("Brief summary of the content"),
        },
        async execute(args, _context) {
          const result = await fetchSibylApi(serverUrl, "/api/filing", {
            method: "POST",
            body: {
              title: args.title,
              content: args.content,
              type: args.type || "summary",
              tags: args.tags || [],
              sourcePageSlugs: args.sourcePageSlugs || [],
              summary: args.summary,
            },
            apiKey,
          });

          const data = result as {
            wikiPageId?: string;
            slug?: string;
            title?: string;
            type?: string;
            linkedPages?: string[];
            linkedCount?: number;
            filedAt?: number;
          };

          return `Filed content as wiki page "${data.title || args.title}" (${data.type || "summary"}). Linked to ${data.linkedCount || 0} source pages. Wiki page ID: ${data.wikiPageId || "unknown"}, Slug: ${data.slug || "unknown"}`;
        },
      }),

      memory_filing_history: tool({
        description:
          "Get history of recently filed wiki pages. Shows what content has been saved to the wiki through filing operations.",
        args: {
          limit: tool.schema
            .number()
            .int()
            .positive()
            .max(20)
            .default(10)
            .describe("Maximum number of history entries to return"),
        },
        async execute(args, _context) {
          const result = await fetchSibylApi(
            serverUrl,
            `/api/filing/history?limit=${args.limit || 10}`,
            { apiKey }
          );

          const data = result as {
            count?: number;
            history?: Array<{
              wikiPageId: string;
              title: string;
              slug: string;
              filedAt: number;
              filedAtDate?: string;
            }>;
          };

          if (!data.history || data.history.length === 0) {
            return "No filing history found.";
          }

          const formatted = data.history.map((entry) => {
            const date = new Date(entry.filedAt).toISOString();
            return `- ${entry.title} (${entry.slug}) [${date}]`;
          });

          return `Recently filed pages (${data.count || data.history.length}):\n${formatted.join("\n")}`;
        },
      }),

      memory_raw_save: tool({
        description:
          "Save a raw resource (text content) to the memory database for later processing. Does not immediately create a wiki page.",
        args: {
          type: tool.schema
            .enum(["pdf", "image", "webpage", "text"])
            .describe("Type of raw resource"),
          filename: tool.schema.string().describe("Filename for the resource"),
          content: tool.schema.string().describe("Text content to save"),
          sourceUrl: tool.schema
            .string()
            .optional()
            .describe("Source URL if applicable"),
          metadata: tool.schema
            .record(tool.schema.string(), tool.schema.unknown())
            .optional()
            .describe("Additional metadata"),
        },
        async execute(args, _context) {
          const result = await fetchSibylApi(serverUrl, "/api/raw-resources", {
            method: "POST",
            body: {
              type: args.type,
              filename: args.filename,
              contentPath: `data/raw/documents/${args.filename}`,
              sourceUrl: args.sourceUrl,
              metadata: {
                ...args.metadata,
                contentPreview: args.content.slice(0, 500),
                contentLength: args.content.length,
              },
            },
            apiKey,
          });

          const data = result as {
            id?: string;
            filename?: string;
            type?: string;
          };

          return `Raw resource saved successfully. ID: ${data.id || "unknown"}, Filename: ${data.filename || args.filename}, Type: ${data.type || args.type}`;
        },
      }),
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!autoInject) return;

      try {
        const result = await fetchSibylApi(serverUrl, "/api/wiki-pages?limit=5", { apiKey });
        const data = (result as { data?: unknown[] }).data || [];
        const pages = data as Array<{
          title: string;
          type: string;
          summary?: string;
          slug: string;
        }>;

        if (pages.length === 0) return;

        const memoryContext = [
          "\n## Sibyl Memory Context",
          "The following memories are available in your knowledge base:",
        ];

        for (const page of pages.slice(0, 5)) {
          memoryContext.push(
            `- ${page.title} (${page.type}): ${page.summary || "See memory_recall for details"}`
          );
        }

        memoryContext.push(
          "\nUse memory_recall to search for specific information, memory_save to store new knowledge, or memory_list to see all available memories."
        );

        output.system.push(memoryContext.join("\n"));
      } catch {
      }
    },
  };

  return hooks;
};

export default SibylPlugin;
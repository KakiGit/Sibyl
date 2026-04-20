import type { Plugin, Hooks, ToolDefinition } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin/tool";

export interface SibylPluginOptions {
  serverUrl?: string;
  dbPath?: string;
  autoInject?: boolean;
  apiKey?: string;
  autoSave?: boolean;
  autoSaveThreshold?: number;
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

interface MessageMetadata {
  messageId: string;
  sessionId: string;
  role: "user" | "assistant";
  timestamp: number;
}

interface MessagePart {
  messageId: string;
  text: string;
  timestamp: number;
}

interface SessionData {
  sessionId: string;
  rawResourceId: string | null;
  messageMetadata: Map<string, MessageMetadata>;
  messageParts: Map<string, MessagePart[]>;
  lastSyncVersion: number;
  createdAt: number;
}

const sessions: Map<string, SessionData> = new Map();

function formatTranscript(metadata: Map<string, MessageMetadata>, parts: Map<string, MessagePart[]>): string {
  const lines: string[] = ["# Session Transcript", ""];
  
  const sortedMessageIds = [...metadata.keys()].sort((a, b) => {
    const aTime = metadata.get(a)?.timestamp || 0;
    const bTime = metadata.get(b)?.timestamp || 0;
    return aTime - bTime;
  });
  
  for (const messageId of sortedMessageIds) {
    const meta = metadata.get(messageId);
    if (!meta) continue;
    
    const messageParts = parts.get(messageId) || [];
    if (messageParts.length === 0) continue;
    
    const roleLabel = meta.role === "user" ? "**User**" : "**Assistant**";
    const timestamp = new Date(meta.timestamp).toISOString();
    lines.push(`### ${roleLabel} (${timestamp})`);
    lines.push("");
    const text = messageParts.map(p => p.text).join("");
    lines.push(text);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

async function syncSessionToRawResource(
  serverUrl: string,
  session: SessionData,
  apiKey?: string
): Promise<string | null> {
  const messagesWithParts = [...session.messageMetadata.values()].filter(
    m => (session.messageParts.get(m.messageId)?.length || 0) > 0
  );
  
  if (messagesWithParts.length === 0) return null;
  
  const transcript = formatTranscript(session.messageMetadata, session.messageParts);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const sessionIdSlug = session.sessionId.replace(/_/g, "-").slice(0, 8).toLowerCase();
  const filename = `session-${sessionIdSlug}-${timestamp}.txt`;
  
  const contentPath = `data/raw/documents/${filename}`;
  
  const body = {
    type: "text",
    filename,
    contentPath,
    metadata: {
      sessionId: session.sessionId,
      messageCount: messagesWithParts.length,
      contentLength: transcript.length,
      sourceType: "opencode-session",
      syncedAt: Date.now(),
    },
    content: transcript,
  };
  
  try {
    const result = await fetchSibylApi(serverUrl, "/api/raw-resources", {
      method: "POST",
      body,
      apiKey,
    });
    
    const data = result as { id?: string };
    return data.id || null;
  } catch {
    return null;
  }
}

async function triggerLlmIngestion(
  serverUrl: string,
  rawResourceId: string,
  apiKey?: string
): Promise<void> {
  try {
    await fetchSibylApi(serverUrl, `/api/ingest/llm/${rawResourceId}`, {
      method: "POST",
      apiKey,
    });
  } catch {
  }
}

export const SibylPlugin: Plugin = async (input, options?: SibylPluginOptions) => {
  const serverUrl = options?.serverUrl || DEFAULT_SERVER_URL;
  const autoInject = options?.autoInject !== false;
  const apiKey = options?.apiKey;
  const autoSave = options?.autoSave ?? true;
  const autoSaveThreshold = options?.autoSaveThreshold ?? 1;

  const hooks: Hooks = {
    tool: {
      memory_recall: tool({
        description:
          "Search Wiki Pages and synthesize an answer using LLM. Returns a synthesized response from correlated Wiki Pages.",
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
            .describe("Maximum number of Wiki Pages to retrieve"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          params.set("search", args.query);
          if (args.type) params.set("type", args.type);
          params.set("limit", String(args.limit || 5));
          params.set("includeContent", "true");

          const result = await fetchSibylApi(
            serverUrl,
            `/api/wiki-pages?${params.toString()}`,
            { apiKey }
          );

          const data = (result as { data?: unknown[] }).data || [];
          if (data.length === 0) {
            return "No relevant Wiki Pages found matching the query.";
          }

          const pages = data as Array<{
            slug: string;
            title: string;
            type: string;
            summary?: string;
            content?: string;
            tags?: string[];
          }>;

          const pagesContent = pages.map((page) => ({
            title: page.title,
            type: page.type,
            summary: page.summary || "",
            content: page.content || "",
          }));

          const synthesizeResult = await fetchSibylApi(serverUrl, "/api/synthesize", {
            method: "POST",
            body: {
              query: args.query,
              sources: pagesContent,
            },
            apiKey,
          });

          const synthesizeData = synthesizeResult as {
            synthesis?: string;
            sourcesUsed?: number;
          };

          return synthesizeData.synthesis || "Unable to synthesize answer from Wiki Pages.";
        },
      }),

      memory_list: tool({
        description:
          "List all Wiki Pages in the Sibyl knowledge base. Returns an index of all stored memories from Wiki Pages.",
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
            return "No Wiki Pages found in the knowledge base.";
          }

          const formatted = pages.map((page) => {
            return `- ${page.title} (${page.type}) [${page.slug}]`;
          });

          return `Found ${pages.length} Wiki Pages:\n${formatted.join("\n")}`;
        },
      }),

      memory_query: tool({
        description:
          "Query Wiki Pages with a question. Retrieves from Wiki Pages only and returns relevant pages metadata.",
        args: {
          question: tool.schema.string().describe("Question to ask the knowledge base"),
          type: tool.schema
            .enum(["entity", "concept", "source", "summary"])
            .optional()
            .describe("Filter by wiki page type"),
          limit: tool.schema
            .number()
            .int()
            .positive()
            .max(20)
            .default(10)
            .describe("Maximum number of pages to return"),
        },
        async execute(args, _context) {
          const params = new URLSearchParams();
          params.set("search", args.question);
          params.set("limit", String(args.limit || 10));
          if (args.type) params.set("type", args.type);

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
            tags?: string[];
          }>;

          if (pages.length === 0) {
            return "No relevant Wiki Pages found in the knowledge base.";
          }

          const summaries = pages.map((page) => {
            let output = `${page.title} (${page.type}): ${page.summary || "No summary available"}`;
            if (page.tags?.length) output += ` [tags: ${page.tags.join(", ")}]`;
            return output;
          });

          return `Found ${pages.length} relevant Wiki Pages:\n\n${summaries.join("\n\n")}`;
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
          "The following Wiki Pages are available in your knowledge base:",
        ];

        for (const page of pages.slice(0, 5)) {
          memoryContext.push(
            `- ${page.title} (${page.type}): ${page.summary || "See memory_recall for details"}`
          );
        }

        memoryContext.push(
          "\nUse memory_recall to search Wiki Pages and synthesize answers, memory_query to retrieve page metadata, or memory_list to see all available Wiki Pages."
        );

        output.system.push(memoryContext.join("\n"));
      } catch {
      }
    },

    event: async ({ event }) => {
      if (!autoSave) return;

      if (event.type === "session.created") {
        const sessionId = (event as any).properties?.sessionID || "default";
        sessions.set(sessionId, {
          sessionId,
          rawResourceId: null,
          messageMetadata: new Map(),
          messageParts: new Map(),
          lastSyncVersion: 0,
          createdAt: Date.now(),
        });
        return;
      }

      if (event.type === "session.idle") {
        const sessionId = (event as any).properties?.sessionID || "default";
        const session = sessions.get(sessionId);
        
        if (!session) return;
        
        const messageCount = session.messageMetadata.size;
        if (messageCount < autoSaveThreshold) return;
        
        const messagesWithParts = [...session.messageMetadata.values()].filter(
          m => (session.messageParts.get(m.messageId)?.length || 0) > 0
        );
        if (messagesWithParts.length < messageCount) return;
        
        let rawResourceId = session.rawResourceId;
        if (!rawResourceId || session.lastSyncVersion < messageCount) {
          rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
          if (rawResourceId) {
            session.rawResourceId = rawResourceId;
          }
        }
        
        if (rawResourceId) {
          await triggerLlmIngestion(serverUrl, rawResourceId, apiKey);
        }
        
        sessions.delete(sessionId);
        return;
      }

      if (event.type === "session.deleted") {
        const sessionId = (event as any).properties?.sessionID || "default";
        sessions.delete(sessionId);
        return;
      }

      if (event.type === "message.updated") {
        const message = (event as any).properties?.info;
        if (!message) return;

        const sessionId = message.sessionID || "default";
        const messageId = message.id || "unknown";
        const role = message.role || "";
        
        if (!role) return;

        let session = sessions.get(sessionId);
        if (!session) {
          session = {
            sessionId,
            rawResourceId: null,
            messageMetadata: new Map(),
            messageParts: new Map(),
            lastSyncVersion: 0,
            createdAt: Date.now(),
          };
          sessions.set(sessionId, session);
        }

        session.messageMetadata.set(messageId, {
          messageId,
          sessionId,
          role,
          timestamp: message.time?.created || Date.now(),
        });

        const messageCount = session.messageMetadata.size;
        if (messageCount < autoSaveThreshold) return;
        if (messageCount <= session.lastSyncVersion) return;

        const messagesWithParts = [...session.messageMetadata.values()].filter(
          m => (session.messageParts.get(m.messageId)?.length || 0) > 0
        );
        if (messagesWithParts.length < messageCount) return;

        const rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
        if (rawResourceId) {
          session.rawResourceId = rawResourceId;
        }
        session.lastSyncVersion = messageCount;
        return;
      }

      if (event.type === "message.part.updated" || (event.type as string) === "message.part.delta") {
        let sessionId, messageId, text, delta;
        
        if ((event.type as string) === "message.part.delta") {
          sessionId = (event as any).properties?.sessionID || "default";
          messageId = (event as any).properties?.messageID || "unknown";
          delta = (event as any).properties?.delta || "";
          text = "";
        } else {
          const part = (event as any).properties?.part;
          if (!part) return;
          if (part.type && part.type !== "text") return;
          sessionId = part.sessionID || "default";
          messageId = part.messageID || "unknown";
          text = part.text || "";
          delta = (event as any).properties?.delta || "";
        }

        if (!text && !delta) return;

        let session = sessions.get(sessionId);
        if (!session) {
          session = {
            sessionId,
            rawResourceId: null,
            messageMetadata: new Map(),
            messageParts: new Map(),
            lastSyncVersion: 0,
            createdAt: Date.now(),
          };
          sessions.set(sessionId, session);
        }

        const messageParts = session.messageParts.get(messageId) || [];
        
        if (delta && messageParts.length > 0) {
          messageParts[messageParts.length - 1].text += delta;
        } else if (text) {
          messageParts.push({
            messageId,
            text,
            timestamp: Date.now(),
          });
        }
        
        session.messageParts.set(messageId, messageParts);

        const messageCount = session.messageMetadata.size;
        if (messageCount < autoSaveThreshold) return;
        if (messageCount <= session.lastSyncVersion) return;

        const messagesWithParts = [...session.messageMetadata.values()].filter(
          m => (session.messageParts.get(m.messageId)?.length || 0) > 0
        );
        if (messagesWithParts.length < messageCount) return;

        const rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
        if (rawResourceId) {
          session.rawResourceId = rawResourceId;
        }
        session.lastSyncVersion = messageCount;
        return;
      }
    },
  };

  return hooks;
};

export default SibylPlugin;
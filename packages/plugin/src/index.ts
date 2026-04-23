import { tool } from "@opencode-ai/plugin/tool";

export interface SibylPluginOptions {
  serverUrl?: string;
  apiKey?: string;
  autoSave?: boolean;
  autoSaveThreshold?: number;
}

const DEFAULT_SERVER_URL = "http://localhost:3000";
const sessions = new Map();

function extractStableSessionName(sessionId: string): string {
  const datePattern = /-\d{4}-\d{2}-\d{2}/;
  const match = sessionId.match(datePattern);
  if (match && match.index !== undefined) {
    return sessionId.substring(0, match.index);
  }
  return sessionId;
}

async function fetchSibylApi(
  serverUrl: string,
  path: string,
  options?: { method?: string; body?: unknown; apiKey?: string }
): Promise<unknown> {
  const url = `${serverUrl}${path}`;
  const headers: Record<string, string> = {};
  if (options?.body) headers["Content-Type"] = "application/json";
  if (options?.apiKey) headers["x-api-key"] = options.apiKey;
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) throw new Error(`Sibyl API error: ${response.status}`);
  return response.json();
}

interface SessionData {
  sessionId: string;
  rawResourceId: string | null;
  messageMetadata: Map<string, { messageId: string; role: string; timestamp: number }>;
  messageParts: Map<string, { text: string; timestamp: number }[]>;
  lastSyncVersion: number;
  createdAt: number;
}

function formatTranscript(session: SessionData): string {
  const lines: string[] = ["# Session Transcript", ""];
  const sortedMetadata = [...session.messageMetadata.entries()].sort(
    (a, b) => a[1].timestamp - b[1].timestamp
  );
  for (const [messageId, meta] of sortedMetadata) {
    const parts = session.messageParts.get(messageId) || [];
    if (parts.length === 0) continue;
    const roleLabel = meta.role === "user" ? "**User**" : "**Assistant**";
    const timestamp = new Date(meta.timestamp).toISOString();
    lines.push(`### ${roleLabel} (${timestamp})`);
    lines.push("");
    lines.push(parts.map(p => p.text).join(""));
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
  const transcript = formatTranscript(session);
  const stableName = extractStableSessionName(session.sessionId);
  const sessionIdSlug = stableName.replace(/_/g, "-").toLowerCase();
  const filename = `session-${sessionIdSlug}.txt`;
  const metadata = {
    sessionId: session.sessionId,
    messageCount: messagesWithParts.length,
    contentLength: transcript.length,
    sourceType: "opencode-session",
    syncedAt: Date.now(),
  };
  try {
    const existingResult = await fetchSibylApi(
      serverUrl,
      `/api/raw-resources/session/${encodeURIComponent(stableName)}`,
      { apiKey }
    );
    const existing = existingResult as { data?: { id: string } };
    if (existing.data?.id) {
      await fetchSibylApi(serverUrl, `/api/raw-resources/${existing.data.id}/content`, {
        method: "PUT",
        body: { content: transcript },
        apiKey,
      });
      await fetchSibylApi(serverUrl, `/api/raw-resources/${existing.data.id}`, {
        method: "PUT",
        body: { metadata },
        apiKey,
      });
      return existing.data.id;
    }
  } catch {}
  try {
    const result = await fetchSibylApi(serverUrl, "/api/raw-resources", {
      method: "POST",
      body: {
        type: "text",
        filename,
        contentPath: `data/raw/documents/${filename}`,
        metadata,
        content: transcript,
      },
      apiKey,
    });
    return (result as { id?: string }).id || null;
  } catch { return null; }
}

async function triggerLlmIngestion(
  serverUrl: string,
  rawResourceId: string,
  apiKey?: string,
  maxRetries: number = 3
): Promise<boolean> {
  const baseDelay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fetchSibylApi(serverUrl, `/api/ingest/llm/${rawResourceId}`, { method: "POST", apiKey });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Sibyl] Ingestion attempt ${attempt}/${maxRetries} failed for raw resource ${rawResourceId}: ${errorMessage}`);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[Sibyl] All ${maxRetries} ingestion attempts failed for raw resource ${rawResourceId}`);
  return false;
}

export default async function(input: unknown, options?: SibylPluginOptions) {
  const serverUrl = options?.serverUrl || process.env.SIBYL_SERVER_URL || DEFAULT_SERVER_URL;
  const apiKey = options?.apiKey || process.env.SIBYL_API_KEY;
  const autoSave = options?.autoSave ?? process.env.SIBYL_AUTO_SAVE !== "false";
  const autoSaveThreshold = options?.autoSaveThreshold ?? parseInt(process.env.SIBYL_AUTO_SAVE_THRESHOLD || "1", 10);

  return {
    tool: {
      memory_recall: tool({
        description: "Search Wiki Pages and synthesize an answer using LLM.",
        args: {
          query: tool.schema.string().describe("Search query"),
        },
        async execute(args: { query: string }) {
          const body: Record<string, unknown> = { query: args.query, maxPages: 5 };
          const result = await fetchSibylApi(serverUrl, "/api/synthesize", {
            method: "POST",
            body,
            apiKey,
          });
          const data = result as { data?: { answer?: string } };
          return data.data?.answer || "Unable to synthesize answer.";
        },
      }),
      memory_list: tool({
        description: "List all Wiki Pages in the Sibyl knowledge base.",
        args: {
          type: tool.schema.enum(["entity", "concept", "source", "summary"]).optional(),
        },
        async execute(args: { type?: string }) {
          const params = new URLSearchParams();
          if (args.type) params.set("type", args.type);
          const result = await fetchSibylApi(serverUrl, `/api/wiki-pages?${params.toString()}`, { apiKey });
          const data = (result as { data?: unknown[] }).data || [];
          if (data.length === 0) return "No Wiki Pages found in the knowledge base.";
          const pages = data as Array<{ title: string; type: string; slug: string }>;
          return `Found ${pages.length} Wiki Pages:\n${pages.map(p => `- ${p.title} (${p.type}) [${p.slug}]`).join("\n")}`;
        },
      }),
      memory_query: tool({
        description: "Query Wiki Pages with a question.",
        args: {
          question: tool.schema.string().describe("Question to ask"),
          type: tool.schema.enum(["entity", "concept", "source", "summary"]).optional(),
          limit: tool.schema.number().int().positive().max(20).default(10),
        },
        async execute(args: { question: string; type?: string; limit?: number }) {
          const params = new URLSearchParams();
          params.set("search", args.question);
          params.set("limit", String(args.limit || 10));
          if (args.type) params.set("type", args.type);
          const result = await fetchSibylApi(serverUrl, `/api/wiki-pages?${params.toString()}`, { apiKey });
          const data = (result as { data?: unknown[] }).data || [];
          if (data.length === 0) return "No relevant Wiki Pages found in the knowledge base.";
          const pages = data as Array<{ title: string; type: string; summary?: string; slug: string; tags?: string[] }>;
          return `Found ${pages.length} relevant Wiki Pages:\n\n${pages.map(p => `${p.title} (${p.type}): ${p.summary || "No summary"}${p.tags?.length ? ` [tags: ${p.tags.join(", ")}]` : ""}`).join("\n\n")}`;
        },
      }),
    },
    event: async ({ event }: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (!autoSave) return;
      if (event.type === "session.created") {
        const rawSessionId = (event.properties?.sessionID as string) || "default";
        const sessionId = extractStableSessionName(rawSessionId);
        sessions.set(sessionId, {
          sessionId: rawSessionId,
          rawResourceId: null,
          messageMetadata: new Map(),
          messageParts: new Map(),
          lastSyncVersion: 0,
          createdAt: Date.now(),
        });
        return;
      }
      if (event.type === "session.idle") {
        const rawSessionId = (event.properties?.sessionID as string) || "default";
        const sessionId = extractStableSessionName(rawSessionId);
        const session = sessions.get(sessionId) as SessionData | undefined;
        if (!session) return;
        const messagesWithParts = [...session.messageMetadata.values()].filter(
          m => (session.messageParts.get(m.messageId)?.length || 0) > 0
        );
        if (messagesWithParts.length < autoSaveThreshold) {
          sessions.delete(sessionId);
          return;
        }
        let rawResourceId = session.rawResourceId;
        if (!rawResourceId) rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
        if (rawResourceId) await triggerLlmIngestion(serverUrl, rawResourceId, apiKey);
        sessions.delete(sessionId);
        return;
      }
      if (event.type === "session.deleted") {
        const rawSessionId = (event.properties?.sessionID as string) || "default";
        const sessionId = extractStableSessionName(rawSessionId);
        const session = sessions.get(sessionId) as SessionData | undefined;
        if (session) {
          const messagesWithParts = [...session.messageMetadata.values()].filter(
            m => (session.messageParts.get(m.messageId)?.length || 0) > 0
          );
          if (messagesWithParts.length >= autoSaveThreshold) {
            let rawResourceId = session.rawResourceId;
            if (!rawResourceId) rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
            if (rawResourceId) await triggerLlmIngestion(serverUrl, rawResourceId, apiKey);
          }
          sessions.delete(sessionId);
        }
        return;
      }
      if (event.type === "message.updated") {
        const message = event.properties?.info as { sessionID?: string; id?: string; role?: string; time?: { created?: number } } | undefined;
        if (!message) return;
        const rawSessionId = message.sessionID || "default";
        const sessionId = extractStableSessionName(rawSessionId);
        const messageId = message.id || "unknown";
        const role = message.role || "";
        if (!role) return;
        let session = sessions.get(sessionId) as SessionData | undefined;
        if (!session) {
          session = {
            sessionId: rawSessionId,
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
          role,
          timestamp: message.time?.created || Date.now(),
        });
        return;
      }
      if (event.type === "message.part.updated" || event.type === "message.part.delta") {
        let rawSessionId: string, messageId: string, text: string, delta: string;
        if (event.type === "message.part.delta") {
          rawSessionId = (event.properties?.sessionID as string) || "default";
          messageId = (event.properties?.messageID as string) || "unknown";
          delta = (event.properties?.delta as string) || "";
          text = "";
        } else {
          const part = event.properties?.part as { sessionID?: string; messageID?: string; text?: string; type?: string } | undefined;
          if (!part) return;
          if (part.type && part.type !== "text") return;
          rawSessionId = part.sessionID || "default";
          messageId = part.messageID || "unknown";
          text = part.text || "";
          delta = (event.properties?.delta as string) || "";
        }
        if (!text && !delta) return;
        const sessionId = extractStableSessionName(rawSessionId);
        let session = sessions.get(sessionId) as SessionData | undefined;
        if (!session) {
          session = {
            sessionId: rawSessionId,
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
        } else if (text || delta) {
          messageParts.push({ text: text || delta, timestamp: Date.now() });
        }
        session.messageParts.set(messageId, messageParts);
        const messagesWithParts = [...session.messageMetadata.values()].filter(
          m => (session.messageParts.get(m.messageId)?.length || 0) > 0
        );
        if (messagesWithParts.length < autoSaveThreshold) return;
        if (messagesWithParts.length <= session.lastSyncVersion) return;
        const rawResourceId = await syncSessionToRawResource(serverUrl, session, apiKey);
        if (rawResourceId) session.rawResourceId = rawResourceId;
        session.lastSyncVersion = messagesWithParts.length;
        return;
      }
    },
  };
}
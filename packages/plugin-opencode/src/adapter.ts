import { tool } from "@opencode-ai/plugin/tool";
import { getServerUrl } from "@sibyl/shared";
import {
  SibylPluginOptions,
  ApiOptions,
  SessionManager,
  createTools,
  extractStableSessionName,
  getToolDescriptions,
} from "@sibyl/plugin-core";

export interface OpenCodePluginResult {
  tool: Record<string, unknown>;
  event: (ctx: { event: { type: string; properties?: Record<string, unknown> } }) => Promise<void>;
  getToolDescriptions: () => string;
}

export function createOpenCodePlugin(input: unknown, options?: SibylPluginOptions): OpenCodePluginResult {
  const serverUrl = options?.serverUrl || getServerUrl();
  const apiKey = options?.apiKey || process.env.SIBYL_API_KEY;
  const autoSave = options?.autoSave ?? process.env.SIBYL_AUTO_SAVE !== "false";
  const autoSaveThreshold = options?.autoSaveThreshold ?? parseInt(process.env.SIBYL_AUTO_SAVE_THRESHOLD || "1", 10);

  const apiOptions: ApiOptions = { serverUrl, apiKey };
  const sessionManager = new SessionManager(apiOptions, autoSaveThreshold);

  const tools = createTools(apiOptions);

  const opencodeTools = {
    memory_recall: tool({
      description: tools.memory_recall.description,
      args: {
        query: tool.schema.string().describe("Search query"),
      },
      async execute(args: { query: string }) {
        return tools.memory_recall.execute(args);
      },
    }),
    memory_list: tool({
      description: tools.memory_list.description,
      args: {
        type: tool.schema.enum(["entity", "concept", "source", "summary"]).optional(),
      },
      async execute(args: { type?: string }) {
        return tools.memory_list.execute(args);
      },
    }),
    memory_query: tool({
      description: tools.memory_query.description,
      args: {
        question: tool.schema.string().describe("Question to ask"),
        type: tool.schema.enum(["entity", "concept", "source", "summary"]).optional(),
        limit: tool.schema.number().int().positive().max(20).default(10),
      },
      async execute(args: { question: string; type?: string; limit?: number }) {
        return tools.memory_query.execute(args);
      },
    }),
  };

  async function handleEvent(ctx: { event: { type: string; properties?: Record<string, unknown> } }) {
    const event = ctx.event;
    if (!autoSave) return;

    if (event.type === "session.created") {
      const rawSessionId = (event.properties?.sessionID as string) || "default";
      await sessionManager.createSessionWithHistory(rawSessionId);
      return;
    }

    if (event.type === "session.idle") {
      const rawSessionId = (event.properties?.sessionID as string) || "default";
      await sessionManager.finalizeSession(rawSessionId);
      return;
    }

    if (event.type === "session.deleted") {
      const rawSessionId = (event.properties?.sessionID as string) || "default";
      await sessionManager.finalizeSession(rawSessionId);
      return;
    }

    if (event.type === "message.updated") {
      const props = event.properties as { sessionID?: string; info?: { sessionID?: string; id?: string; role?: string; time?: { created?: number } } } | undefined;
      if (!props) return;
      
      const message = props.info;
      if (!message) return;

      const rawSessionId = props.sessionID || message.sessionID || "default";
      const messageId = message.id || "unknown";
      const role = message.role || "";
      if (!role) return;

      const session = await sessionManager.getOrCreateSessionWithHistory(rawSessionId);
      sessionManager.addMessageMetadata(session, messageId, role, message.time?.created || Date.now());
      return;
    }

    if (event.type === "message.part.updated" || event.type === "message.part.delta") {
      const props = event.properties as { 
        sessionID?: string;
        messageID?: string;
        delta?: string;
        part?: { sessionID?: string; messageID?: string; text?: string; type?: string };
      } | undefined;
      
      let rawSessionId: string, messageId: string, text: string, delta: string;

      if (event.type === "message.part.delta") {
        if (!props) return;
        rawSessionId = props.sessionID || "default";
        messageId = props.messageID || "unknown";
        delta = props.delta || "";
        text = "";
      } else {
        const part = props?.part;
        if (!part) return;
        if (part.type && part.type !== "text") return;

        rawSessionId = props?.sessionID || part.sessionID || "default";
        messageId = part.messageID || "unknown";
        text = part.text || "";
        delta = props?.delta || "";
      }

      if (!text && !delta) return;

      const session = await sessionManager.getOrCreateSessionWithHistory(rawSessionId);

      if (delta) {
        sessionManager.appendMessagePartDelta(session, messageId, delta);
      } else if (text) {
        sessionManager.addMessagePart(session, messageId, text, Date.now());
        await sessionManager.autoSyncIfNeeded(rawSessionId);
      }

      return;
    }
  }

  return {
    tool: opencodeTools,
    event: handleEvent,
    getToolDescriptions,
  };
}

export { getToolDescriptions } from "@sibyl/plugin-core";
import { stdin } from "bun";
import { getServerUrl } from "@sibyl/shared";
import {
  SessionStartInput,
  SessionEndInput,
  HookOutput,
  ApiOptions,
  SessionManager,
  extractStableSessionName,
  createSession,
  countMessagesWithParts,
  formatTranscript,
  syncSessionToRawResource,
  triggerLlmIngestion,
} from "@sibyl/plugin-core";

interface SessionState {
  sessionId: string;
  startTime: number;
  transcriptPath?: string;
  messageCount: number;
  lastSyncTime: number;
}

const sessions = new Map<string, SessionState>();
const sessionManagers = new Map<string, SessionManager>();

function getApiOptions(): ApiOptions {
  const serverUrl = getServerUrl();
  const apiKey = process.env.SIBYL_API_KEY;
  return { serverUrl, apiKey };
}

function getAutoSaveThreshold(): number {
  return parseInt(process.env.SIBYL_AUTO_SAVE_THRESHOLD || "1", 10);
}

function parseHookInput<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("[Sibyl Hook] Failed to parse input:", error);
    throw error;
  }
}

async function handleSessionStart(input: SessionStartInput): Promise<HookOutput> {
  const sessionId = input.session_id || input.conversation_id;
  const apiOptions = getApiOptions();
  const threshold = getAutoSaveThreshold();

  const manager = new SessionManager(apiOptions, threshold);
  manager.createSession(sessionId);
  sessionManagers.set(sessionId, manager);

  sessions.set(sessionId, {
    sessionId,
    startTime: Date.now(),
    transcriptPath: input.transcript_path,
    messageCount: 0,
    lastSyncTime: 0,
  });

  console.log(`[Sibyl Hook] Session started: ${sessionId}`);

  return {
    env: {
      SIBYL_SESSION_ID: sessionId,
    },
    additional_context: "Sibyl memory system is active for this session.",
  };
}

async function handleSessionEnd(input: SessionEndInput): Promise<HookOutput> {
  const sessionId = input.session_id || input.conversation_id;
  const state = sessions.get(sessionId);
  const manager = sessionManagers.get(sessionId);

  if (!state || !manager) {
    console.log(`[Sibyl Hook] No session found for: ${sessionId}`);
    return {};
  }

  const apiOptions = getApiOptions();
  const session = manager.getSession(sessionId);

  if (session) {
    const messagesWithParts = countMessagesWithParts(session);
    if (messagesWithParts >= getAutoSaveThreshold()) {
      const rawResourceId = await syncSessionToRawResource(apiOptions, session);
      if (rawResourceId) {
        await triggerLlmIngestion(apiOptions, rawResourceId);
        console.log(`[Sibyl Hook] Session synced: ${sessionId}, raw resource: ${rawResourceId}`);
      }
    }
  }

  sessions.delete(sessionId);
  sessionManagers.delete(sessionId);

  console.log(`[Sibyl Hook] Session ended: ${sessionId}, duration: ${input.duration_ms}ms`);

  return {};
}

async function handleTranscriptUpdate(sessionId: string, transcriptPath: string): Promise<void> {
  const state = sessions.get(sessionId);
  if (!state) return;

  try {
    const file = Bun.file(transcriptPath);
    const content = await file.text();

    const messageCount = (content.match(/\*\*User\*\*|\*\*Assistant\*\*/g) || []).length;
    state.messageCount = messageCount;

    if (messageCount >= getAutoSaveThreshold() && Date.now() - state.lastSyncTime > 5000) {
      const apiOptions = getApiOptions();
      const stableName = extractStableSessionName(sessionId);
      const sessionIdSlug = stableName.replace(/_/g, "-").toLowerCase();
      const filename = `session-${sessionIdSlug}.txt`;

      const metadata = {
        sessionId,
        messageCount,
        contentLength: content.length,
        sourceType: "cursor-session",
        syncedAt: Date.now(),
      };

      try {
        const result = await fetch(`${apiOptions.serverUrl}/api/raw-resources/session/${encodeURIComponent(stableName)}`, {
          headers: apiOptions.apiKey ? { "x-api-key": apiOptions.apiKey } : {},
        });
        const existing = await result.json() as { data?: { id?: string } };

        if (existing.data?.id) {
          await fetch(`${apiOptions.serverUrl}/api/raw-resources/${existing.data.id}/content`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(apiOptions.apiKey ? { "x-api-key": apiOptions.apiKey } : {}),
            },
            body: JSON.stringify({ content }),
          });
        } else {
          await fetch(`${apiOptions.serverUrl}/api/raw-resources`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiOptions.apiKey ? { "x-api-key": apiOptions.apiKey } : {}),
            },
            body: JSON.stringify({
              type: "text",
              filename,
              contentPath: `data/raw/documents/${filename}`,
              metadata,
              content,
            }),
          });
        }
        state.lastSyncTime = Date.now();
      } catch (error) {
        console.error("[Sibyl Hook] Failed to sync transcript:", error);
      }
    }
  } catch (error) {
    console.error("[Sibyl Hook] Failed to read transcript:", error);
  }
}

async function main() {
  try {
    const text = await stdin.text();
    if (!text.trim()) {
      console.log(JSON.stringify({}));
      return;
    }

    const input = parseHookInput<SessionStartInput | SessionEndInput>(text);
    const hookEvent = input.hook_event_name;

    let output: HookOutput = {};

    if (hookEvent === "sessionStart") {
      output = await handleSessionStart(input as SessionStartInput);
    } else if (hookEvent === "sessionEnd") {
      output = await handleSessionEnd(input as SessionEndInput);
    } else if (hookEvent === "stop" || hookEvent === "preCompact") {
      const sessionId = input.conversation_id;
      const state = sessions.get(sessionId);
      if (state?.transcriptPath) {
        await handleTranscriptUpdate(sessionId, state.transcriptPath);
      }
    }

    console.log(JSON.stringify(output));
  } catch (error) {
    console.error("[Sibyl Hook] Error:", error);
    console.log(JSON.stringify({}));
  }
}

main();
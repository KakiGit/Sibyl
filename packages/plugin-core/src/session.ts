import type { ApiOptions, SessionData } from "./types.js";
import {
  getRawResourceBySession,
  createRawResource,
  updateRawResourceContent,
  updateRawResourceMetadata,
  triggerLlmIngestion,
} from "./api.js";

export function extractStableSessionName(sessionId: string): string {
  const datePattern = /-\d{4}-\d{2}-\d{2}/;
  const match = sessionId.match(datePattern);
  if (match && match.index !== undefined) {
    return sessionId.substring(0, match.index);
  }
  return sessionId;
}

export function createSession(sessionId: string): SessionData {
  return {
    sessionId,
    rawResourceId: null,
    messageMetadata: new Map(),
    messageParts: new Map(),
    lastSyncVersion: 0,
    createdAt: Date.now(),
  };
}

export function formatTranscript(session: SessionData): string {
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

export function countMessagesWithParts(session: SessionData): number {
  return [...session.messageMetadata.values()].filter(
    m => (session.messageParts.get(m.messageId)?.length || 0) > 0
  ).length;
}

export function addMessageMetadata(
  session: SessionData,
  messageId: string,
  role: string,
  timestamp: number
): void {
  session.messageMetadata.set(messageId, {
    messageId,
    role,
    timestamp,
  });
}

export function addMessagePart(
  session: SessionData,
  messageId: string,
  text: string,
  timestamp: number
): void {
  const messageParts = session.messageParts.get(messageId) || [];
  messageParts.push({ text, timestamp });
  session.messageParts.set(messageId, messageParts);
}

export function appendMessagePartDelta(
  session: SessionData,
  messageId: string,
  delta: string
): void {
  const messageParts = session.messageParts.get(messageId) || [];
  if (messageParts.length > 0) {
    messageParts[messageParts.length - 1].text += delta;
  } else {
    messageParts.push({ text: delta, timestamp: Date.now() });
  }
  session.messageParts.set(messageId, messageParts);
}

export async function syncSessionToRawResource(
  options: ApiOptions,
  session: SessionData
): Promise<string | null> {
  const messagesWithParts = countMessagesWithParts(session);
  if (messagesWithParts === 0) return null;

  const transcript = formatTranscript(session);
  const stableName = extractStableSessionName(session.sessionId);
  const sessionIdSlug = stableName.replace(/_/g, "-").toLowerCase();
  const filename = `session-${sessionIdSlug}.txt`;
  const metadata = {
    sessionId: session.sessionId,
    messageCount: messagesWithParts,
    contentLength: transcript.length,
    sourceType: "session",
    syncedAt: Date.now(),
  };

  const existing = await getRawResourceBySession(options, stableName);
  if (existing?.id) {
    await updateRawResourceContent(options, existing.id, transcript);
    await updateRawResourceMetadata(options, existing.id, metadata);
    return existing.id;
  }

  const created = await createRawResource(options, {
    type: "text",
    filename,
    contentPath: `data/raw/documents/${filename}`,
    metadata,
    content: transcript,
  });
  return created?.id || null;
}

export class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private options: ApiOptions;
  private autoSaveThreshold: number;

  constructor(options: ApiOptions, autoSaveThreshold: number = 1) {
    this.options = options;
    this.autoSaveThreshold = autoSaveThreshold;
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(extractStableSessionName(sessionId));
  }

  createSession(sessionId: string): SessionData {
    const stableName = extractStableSessionName(sessionId);
    const session = createSession(sessionId);
    this.sessions.set(stableName, session);
    return session;
  }

  getOrCreateSession(sessionId: string): SessionData {
    const stableName = extractStableSessionName(sessionId);
    const existing = this.sessions.get(stableName);
    if (existing) return existing;
    return this.createSession(sessionId);
  }

  deleteSession(sessionId: string): SessionData | undefined {
    const stableName = extractStableSessionName(sessionId);
    const session = this.sessions.get(stableName);
    if (session) {
      this.sessions.delete(stableName);
    }
    return session;
  }

  addMessageMetadata(session: SessionData, messageId: string, role: string, timestamp: number): void {
    addMessageMetadata(session, messageId, role, timestamp);
  }

  addMessagePart(session: SessionData, messageId: string, text: string, timestamp: number): void {
    addMessagePart(session, messageId, text, timestamp);
  }

  appendMessagePartDelta(session: SessionData, messageId: string, delta: string): void {
    appendMessagePartDelta(session, messageId, delta);
  }

  async syncSession(sessionId: string): Promise<string | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const messagesWithParts = countMessagesWithParts(session);
    if (messagesWithParts < this.autoSaveThreshold) return null;

    const rawResourceId = await syncSessionToRawResource(this.options, session);
    if (rawResourceId) {
      session.rawResourceId = rawResourceId;
      await triggerLlmIngestion(this.options, rawResourceId);
    }
    return rawResourceId;
  }

  async finalizeSession(sessionId: string): Promise<string | null> {
    const session = this.deleteSession(sessionId);
    if (!session) return null;

    const messagesWithParts = countMessagesWithParts(session);
    if (messagesWithParts < this.autoSaveThreshold) return null;

    const rawResourceId = session.rawResourceId || await syncSessionToRawResource(this.options, session);
    if (rawResourceId) {
      await triggerLlmIngestion(this.options, rawResourceId);
    }
    return rawResourceId;
  }

  shouldAutoSync(session: SessionData): boolean {
    const messagesWithParts = countMessagesWithParts(session);
    return messagesWithParts >= this.autoSaveThreshold && messagesWithParts > session.lastSyncVersion;
  }

  async autoSyncIfNeeded(sessionId: string): Promise<string | null> {
    const session = this.getSession(sessionId);
    if (!session || !this.shouldAutoSync(session)) return null;

    const rawResourceId = await syncSessionToRawResource(this.options, session);
    if (rawResourceId) {
      session.rawResourceId = rawResourceId;
      session.lastSyncVersion = countMessagesWithParts(session);
    }
    return rawResourceId;
  }
}
import { describe, test, expect } from "bun:test";
import { extractStableSessionName, createSession, countMessagesWithParts, formatTranscript } from "../src/session.js";

describe("extractStableSessionName", () => {
  test("extracts stable name from session ID with date suffix", () => {
    const sessionId = "my-session-2024-04-25";
    const result = extractStableSessionName(sessionId);
    expect(result).toBe("my-session");
  });

  test("returns original session ID if no date suffix", () => {
    const sessionId = "my-session";
    const result = extractStableSessionName(sessionId);
    expect(result).toBe("my-session");
  });

  test("handles empty session ID", () => {
    const result = extractStableSessionName("");
    expect(result).toBe("");
  });
});

describe("createSession", () => {
  test("creates a session with correct initial values", () => {
    const session = createSession("test-session");
    expect(session.sessionId).toBe("test-session");
    expect(session.rawResourceId).toBeNull();
    expect(session.messageMetadata.size).toBe(0);
    expect(session.messageParts.size).toBe(0);
    expect(session.lastSyncVersion).toBe(0);
    expect(session.createdAt).toBeGreaterThan(0);
  });
});

describe("countMessagesWithParts", () => {
  test("returns 0 for session with no messages", () => {
    const session = createSession("test");
    expect(countMessagesWithParts(session)).toBe(0);
  });

  test("returns 0 for messages without parts", () => {
    const session = createSession("test");
    session.messageMetadata.set("msg1", { messageId: "msg1", role: "user", timestamp: Date.now() });
    expect(countMessagesWithParts(session)).toBe(0);
  });

  test("counts messages with parts", () => {
    const session = createSession("test");
    session.messageMetadata.set("msg1", { messageId: "msg1", role: "user", timestamp: Date.now() });
    session.messageParts.set("msg1", [{ text: "hello", timestamp: Date.now() }]);
    session.messageMetadata.set("msg2", { messageId: "msg2", role: "assistant", timestamp: Date.now() });
    session.messageParts.set("msg2", [{ text: "response", timestamp: Date.now() }]);
    expect(countMessagesWithParts(session)).toBe(2);
  });
});

describe("formatTranscript", () => {
  test("returns empty transcript for session with no messages", () => {
    const session = createSession("test");
    const result = formatTranscript(session);
    expect(result).toContain("# Session Transcript");
  });

  test("formats messages in transcript", () => {
    const session = createSession("test");
    session.messageMetadata.set("msg1", { messageId: "msg1", role: "user", timestamp: 1000 });
    session.messageParts.set("msg1", [{ text: "Hello", timestamp: 1000 }]);
    session.messageMetadata.set("msg2", { messageId: "msg2", role: "assistant", timestamp: 2000 });
    session.messageParts.set("msg2", [{ text: "Hi there!", timestamp: 2000 }]);
    const result = formatTranscript(session);
    expect(result).toContain("**User**");
    expect(result).toContain("**Assistant**");
    expect(result).toContain("Hello");
    expect(result).toContain("Hi there!");
  });
});
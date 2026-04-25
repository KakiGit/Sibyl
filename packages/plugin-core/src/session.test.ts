import { describe, test, expect } from "bun:test";
import { extractStableSessionName, createSession, countMessagesWithParts, formatTranscript, parseTranscript } from "../src/session.js";

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

describe("parseTranscript", () => {
  test("parses empty transcript", () => {
    const result = parseTranscript("# Session Transcript\n\n");
    expect(result.messageMetadata.size).toBe(0);
    expect(result.messageParts.size).toBe(0);
  });

  test("parses transcript with messages", () => {
    const transcript = `# Session Transcript

### **User** (2026-04-25T20:00:00.000Z)

Hello world

---

### **Assistant** (2026-04-25T20:00:01.000Z)

Hi there! How can I help?

---
`;
    const result = parseTranscript(transcript);
    expect(result.messageMetadata.size).toBe(2);
    expect(result.messageParts.size).toBe(2);
    
    const messages = [...result.messageMetadata.values()].sort((a, b) => a.timestamp - b.timestamp);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    
    const userText = result.messageParts.get(messages[0].messageId)?.[0]?.text;
    expect(userText).toContain("Hello world");
    
    const assistantText = result.messageParts.get(messages[1].messageId)?.[0]?.text;
    expect(assistantText).toContain("Hi there!");
  });

  test("roundtrip: format then parse preserves content", () => {
    const session = createSession("test");
    session.messageMetadata.set("msg1", { messageId: "msg1", role: "user", timestamp: 1746000000000 });
    session.messageParts.set("msg1", [{ text: "Test message content", timestamp: 1746000000000 }]);
    session.messageMetadata.set("msg2", { messageId: "msg2", role: "assistant", timestamp: 1746000001000 });
    session.messageParts.set("msg2", [{ text: "Response content here", timestamp: 1746000001000 }]);
    
    const formatted = formatTranscript(session);
    const parsed = parseTranscript(formatted);
    
    expect(parsed.messageMetadata.size).toBe(2);
    expect(parsed.messageParts.size).toBe(2);
    
    const originalCount = countMessagesWithParts(session);
    const parsedCount = [...parsed.messageMetadata.values()].filter(
      m => (parsed.messageParts.get(m.messageId)?.length || 0) > 0
    ).length;
    expect(parsedCount).toBe(originalCount);
  });

  test("preserves message order by timestamp", () => {
    const transcript = `# Session Transcript

### **Assistant** (2026-04-25T20:00:02.000Z)

Second message

---

### **User** (2026-04-25T20:00:00.000Z)

First message

---
`;
    const result = parseTranscript(transcript);
    const messages = [...result.messageMetadata.values()].sort((a, b) => a.timestamp - b.timestamp);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });
});
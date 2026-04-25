import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createOpenCodePlugin, getToolDescriptions } from "../src/adapter.js";

interface MockFetchCall {
  url: string;
  options?: { method?: string; body?: unknown; headers?: Record<string, string> };
}

let originalFetch: typeof fetch;
let fetchCalls: MockFetchCall[] = [];
let mockResponses: Record<string, unknown> = {};

function mockFetch(url: string | URL | Request, options?: RequestInit): Promise<Response> {
  const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  const headers: Record<string, string> = {};
  if (options?.headers) {
    const headersObj = options.headers as Record<string, string>;
    for (const key in headersObj) {
      headers[key] = headersObj[key];
    }
  }
  fetchCalls.push({
    url: urlString,
    options: {
      method: options?.method,
      body: options?.body ? JSON.parse(options.body as string) : undefined,
      headers,
    },
  });

  const path = urlString.replace("http://localhost:3000", "");
  const response = mockResponses[path] || { data: [] };

  return Promise.resolve({
    ok: true,
    json: async () => response,
  } as Response);
}

describe("createOpenCodePlugin", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    mockResponses = {};
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("creates plugin with tools", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.tool).toBeDefined();
    expect(plugin.tool.memory_recall).toBeDefined();
    expect(plugin.tool.memory_list).toBeDefined();
    expect(plugin.tool.memory_query).toBeDefined();
  });

  test("creates plugin with event handler", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.event).toBeDefined();
    expect(typeof plugin.event).toBe("function");
  });

  test("creates plugin with getToolDescriptions", () => {
    const plugin = createOpenCodePlugin({}, {});
    expect(plugin.getToolDescriptions).toBeDefined();
    expect(typeof plugin.getToolDescriptions).toBe("function");
  });

  test("uses custom server URL from options", () => {
    const plugin = createOpenCodePlugin({}, { serverUrl: "http://custom:4000" });
    expect(plugin).toBeDefined();
  });

  test("event handler returns early when autoSave is false", async () => {
    const plugin = createOpenCodePlugin({}, { autoSave: false });
    const result = await plugin.event({ event: { type: "session.created", properties: { sessionID: "test" } } });
    expect(result).toBeUndefined();
  });

  test("syncs session to raw resource after messages", async () => {
    mockResponses["/api/raw-resources/session/test-session"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test-session.txt" };
    mockResponses["/api/ingest/llm/raw-id"] = { data: { rawResourceId: "raw-id", processed: true } };

    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session", id: "msg-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session", messageID: "msg-1", type: "text", text: "Hello" } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session", id: "msg-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session", messageID: "msg-2", type: "text", text: "Hi there!" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/test-session");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    const body = fetchCalls[1].options?.body as any;
    expect(body?.content).toContain("Hello");
    expect(body?.content).toContain("Hi there!");
  });

  test("session.idle triggers LLM ingestion", async () => {
    mockResponses["/api/raw-resources/session/session-idle-test"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id-123", filename: "session-session-idle-test.txt" };
    mockResponses["/api/ingest/llm/raw-id-123"] = { 
      data: { rawResourceId: "raw-id-123", processed: true } 
    };

    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await plugin.event({ event: { 
      type: "session.created", 
      properties: { sessionID: "session-idle-test" } 
    } as any });
    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "session-idle-test", id: "msg-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "session-idle-test", messageID: "msg-1", type: "text", text: "Test message" } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "session-idle-test", id: "msg-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "session-idle-test", messageID: "msg-2", type: "text", text: "Response" } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "session.idle", 
      properties: { sessionID: "session-idle-test" } 
    } as any });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/session-idle-test");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    expect(fetchCalls[2].url).toBe("http://localhost:3000/api/ingest/llm/raw-id-123");
    expect(fetchCalls[2].options?.method).toBe("POST");
  });

  test("handles delta arriving before full text part", async () => {
    mockResponses["/api/raw-resources/session/test-delta-first"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test-delta-first.txt" };

    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta-first", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.delta", 
      properties: { 
        sessionID: "test-delta-first",
        messageID: "msg-user-1",
        delta: "Hello"
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.delta", 
      properties: { 
        sessionID: "test-delta-first",
        messageID: "msg-user-1",
        delta: " world"
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta-first", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta-first", messageID: "msg-assistant-1", type: "text", text: "Hi there!" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(2);
    const body = fetchCalls[1].options?.body as any;
    expect(body?.content).toContain("Hello world");
    expect(body?.content).toContain("Hi there!");
  });

  test("normalizes session IDs with timestamps to stable session name", async () => {
    mockResponses["/api/raw-resources/session/ses-249c"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-timestamp-id", filename: "session-ses-249c.txt" };

    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-249c-2026-04-22t17-30-31-649z", id: "msg-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "ses-249c-2026-04-22t17-30-31-649z", messageID: "msg-1", type: "text", text: "First message" } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-249c-2026-04-22t17-35-00-123z", id: "msg-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "ses-249c-2026-04-22t17-35-00-123z", messageID: "msg-2", type: "text", text: "Second message" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/ses-249c");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    const body = fetchCalls[1].options?.body as any;
    expect(body?.filename).toBe("session-ses-249c.txt");
    expect(body?.content).toContain("First message");
    expect(body?.content).toContain("Second message");
  });

  test("ignores non-text parts", async () => {
    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true
    });

    await plugin.event({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-non-text", messageID: "msg-1", type: "tool" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(0);
  });

  test("ignores other events", async () => {
    const plugin = createOpenCodePlugin({}, { 
      serverUrl: "http://localhost:3000",
      autoSave: true
    });

    await plugin.event({ event: { type: "session.updated", properties: { info: { id: "test" } } } as any });
    await plugin.event({ event: { type: "file.edited", properties: { file: "test.ts" } } as any });

    expect(fetchCalls.length).toBe(0);
  });
});

describe("getToolDescriptions", () => {
  test("returns tool descriptions", () => {
    const result = getToolDescriptions();
    expect(result).toContain("memory_recall");
    expect(result).toContain("memory_list");
    expect(result).toContain("memory_query");
  });
});
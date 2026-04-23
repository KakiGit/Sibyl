import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import SibylPlugin from "./index.js";

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

describe("SibylPlugin", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    mockResponses = {};
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns hooks with only memory_query, memory_list, and memory_recall tools", async () => {
    const hooks = await SibylPlugin(
      {
        client: {} as any,
        project: {} as any,
        directory: "/test",
        worktree: "/test",
        experimental_workspace: { register: () => {} },
        serverUrl: new URL("http://localhost:3000"),
        $: {} as any,
      },
      { serverUrl: "http://localhost:3000" }
    );

    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.memory_recall).toBeDefined();
    expect(hooks.tool?.memory_list).toBeDefined();
    expect(hooks.tool?.memory_query).toBeDefined();
    });

  it("memory_recall tool synthesizes answer", async () => {
    mockResponses["/api/synthesize"] = {
      data: {
        answer: "Based on the Wiki Pages, here is a synthesized answer about test.",
        citations: [],
      },
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_recall?.execute({ query: "test" }, {} as any);

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/api/synthesize");
    expect(fetchCalls[0].options.body).toEqual({ query: "test", maxPages: 5 });
    expect(result).toContain("synthesized answer");
  });

  it("memory_recall returns error message when synthesis fails", async () => {
    mockResponses["/api/synthesize"] = { error: "Failed to synthesize" };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_recall?.execute({ query: "test" }, {} as any);

    expect(result).toBe("Unable to synthesize answer.");
  });

  it("memory_list tool fetches all Wiki Pages", async () => {
    mockResponses["/api/wiki-pages?"] = {
      data: [
        { slug: "page-1", title: "Page One", type: "entity" },
        { slug: "page-2", title: "Page Two", type: "concept" },
      ],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_list?.execute({}, {} as any);

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("/api/wiki-pages");
    expect(result).toContain("Found 2 Wiki Pages");
    expect(result).toContain("Page One");
    expect(result).toContain("Page Two");
  });

  it("memory_list filters by type", async () => {
    mockResponses["/api/wiki-pages?type=entity"] = {
      data: [{ slug: "entity-1", title: "Entity One", type: "entity" }],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_list?.execute({ type: "entity" }, {} as any);

    expect(fetchCalls[0].url).toContain("type=entity");
    expect(result).toContain("Entity One");
  });

  it("memory_query tool queries Wiki Pages only", async () => {
    (global as any).fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchCalls.push({
        url: urlString,
        options: {
          method: options?.method,
          body: options?.body ? JSON.parse(options.body as string) : undefined,
        },
      });

      if (urlString.includes("/api/wiki-pages")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { title: "Test Result", type: "concept", summary: "Test summary", slug: "test-result", tags: ["test"] },
            ],
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({ data: [] }),
      } as Response;
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_query?.execute({ question: "test question", limit: 10 }, {} as any);

    expect(fetchCalls[0].url).toContain("search=test");
    expect(result).toContain("Found 1 relevant Wiki Pages");
    expect(result).toContain("Test Result");
  });

  it("memory_query returns no Wiki Pages message when empty", async () => {
    mockResponses["/api/wiki-pages?search=empty&limit=10"] = { data: [] };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_query?.execute({ question: "empty", limit: 10 }, {} as any);

    expect(result).toBe("No relevant Wiki Pages found in the knowledge base.");
  });

  it("uses custom server URL from options", async () => {
    mockResponses["/api/synthesize"] = { data: { answer: "test answer" } };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://custom-server:4000" });

    await hooks.tool?.memory_recall?.execute({ query: "test" }, {} as any);

    expect(fetchCalls[0].url).toContain("http://custom-server:4000");
  });

  it("uses default server URL when not provided", async () => {
    mockResponses["/api/synthesize"] = { data: { answer: "test answer" } };

    const hooks = await SibylPlugin({} as any);

    await hooks.tool?.memory_recall?.execute({ query: "test" }, {} as any);

    expect(fetchCalls[0].url).toContain("http://localhost:3000");
  });

  it("includes apiKey in request headers", async () => {
    mockResponses["/api/synthesize"] = { data: { answer: "test answer" } };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      apiKey: "test-api-key"
    });

    await hooks.tool?.memory_recall?.execute({ query: "test" }, {} as any);

    expect(fetchCalls[0].options?.headers?.["x-api-key"]).toBe("test-api-key");
  });
});

describe("auto-save functionality", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    mockResponses = {};
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("event hook accumulates text parts from message events", async () => {
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 3
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session-123", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session-123", messageID: "msg-user-1", type: "text", text: "Hello" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session-123", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session-123", messageID: "msg-assistant-1", type: "text", text: "Hi there!" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(0);
  });

  it("saves transcript as Raw Resource after threshold messages", async () => {
    mockResponses["/api/raw-resources/session/test-session-abc"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-transcript-id", filename: "session-test-session-abc.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session-abc", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session-abc", messageID: "msg-user-1", type: "text", text: "Question 1" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session-abc", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session-abc", messageID: "msg-assistant-1", type: "text", text: "Answer 1" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/test-session-abc");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    expect(fetchCalls[1].options?.method).toBe("POST");
    const body = fetchCalls[1].options?.body as any;
    expect(body?.type).toBe("text");
    expect(body?.metadata?.sourceType).toBe("opencode-session");
    expect(body?.content).toContain("Session Transcript");
    expect(body?.content).toContain("Question 1");
    expect(body?.content).toContain("Answer 1");
    expect(body?.filename).toBe("session-test-session-abc.txt");
  });

  it("does not save when autoSave is false", async () => {
    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: false
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-session", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-session", messageID: "msg-user-1", type: "text", text: "Hello" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(0);
  });

  it("updates existing raw resource when session already saved", async () => {
    mockResponses["/api/raw-resources/session/existing-session"] = { 
      data: { id: "existing-raw-id", filename: "session-existing-session.txt" } 
    };
    mockResponses["/api/raw-resources/existing-raw-id/content"] = { success: true };
    mockResponses["/api/raw-resources/existing-raw-id"] = { data: { id: "existing-raw-id" } };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "existing-session", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "existing-session", messageID: "msg-user-1", type: "text", text: "First question" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "existing-session", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "existing-session", messageID: "msg-assistant-1", type: "text", text: "First answer" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/existing-session");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources/existing-raw-id/content");
    expect(fetchCalls[1].options?.method).toBe("PUT");
    const contentBody = fetchCalls[1].options?.body as any;
    expect(contentBody?.content).toContain("First question");
    expect(contentBody?.content).toContain("First answer");
    expect(fetchCalls[2].url).toBe("http://localhost:3000/api/raw-resources/existing-raw-id");
    expect(fetchCalls[2].options?.method).toBe("PUT");
  });

  it("formats transcript with timestamps and roles", async () => {
    mockResponses["/api/raw-resources/session/test-format"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test-format.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-format", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-format", messageID: "msg-user-1", type: "text", text: "User message" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-format", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-format", messageID: "msg-assistant-1", type: "text", text: "Assistant message" } 
      } 
    } as any });

    const body = fetchCalls[1].options?.body as any;
    expect(body?.content).toContain("**User**");
    expect(body?.content).toContain("**Assistant**");
    expect(body?.content).toContain("User message");
    expect(body?.content).toContain("Assistant message");
  });

  it("handles delta updates for streaming", async () => {
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 5
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta", messageID: "msg-user-1", type: "text", text: "Hello" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta", messageID: "msg-assistant-1", type: "text", text: "Hi" }
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta", messageID: "msg-assistant-1", type: "text", text: "Hi" },
        delta: " there!"
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta", id: "msg-user-2", role: "user", time: { created: 3000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta", messageID: "msg-user-2", type: "text", text: "Another question" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta", id: "msg-assistant-2", role: "assistant", time: { created: 4000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-delta", messageID: "msg-assistant-2", type: "text", text: "Another answer" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(0);
  });

  it("ignores non-text parts", async () => {
    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true
    });

    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "test-non-text", messageID: "msg-1", type: "tool" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(0);
  });

  it("ignores other events", async () => {
    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true
    });

    await hooks.event?.({ event: { type: "session.updated", properties: { info: { id: "test" } } } as any });
    await hooks.event?.({ event: { type: "file.edited", properties: { file: "test.ts" } } as any });

    expect(fetchCalls.length).toBe(0);
  });

  it("handles delta arriving before full text part", async () => {
    mockResponses["/api/raw-resources/session/test-delta-first"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id", filename: "session-test-delta-first.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta-first", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.delta", 
      properties: { 
        sessionID: "test-delta-first",
        messageID: "msg-user-1",
        delta: "Hello"
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.delta", 
      properties: { 
        sessionID: "test-delta-first",
        messageID: "msg-user-1",
        delta: " world"
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "test-delta-first", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
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

  it("session.idle triggers ingestion even when some messages lack text parts", async () => {
    mockResponses["/api/raw-resources/session/mixed-session"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id-mixed", filename: "session-mixed-session.txt" };
    mockResponses["/api/ingest/llm/raw-id-mixed"] = { 
      data: { rawResourceId: "raw-id-mixed", processed: true } 
    };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "mixed-session", id: "msg-user-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "mixed-session", messageID: "msg-user-1", type: "text", text: "User text" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "mixed-session", id: "msg-assistant-1", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "mixed-session", id: "msg-tool-1", role: "assistant", time: { created: 3000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "mixed-session", messageID: "msg-assistant-1", type: "text", text: "Assistant text" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "session.idle", 
      properties: { sessionID: "mixed-session" } 
    } as any });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/mixed-session");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    expect(fetchCalls[2].url).toBe("http://localhost:3000/api/ingest/llm/raw-id-mixed");
    const body = fetchCalls[1].options?.body as any;
    expect(body?.content).toContain("User text");
    expect(body?.content).toContain("Assistant text");
  });

  it("session.idle triggers LLM ingestion", async () => {
    mockResponses["/api/raw-resources/session/session-idle-test"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-id-123", filename: "session-session-idle-test.txt" };
    mockResponses["/api/ingest/llm/raw-id-123"] = { 
      data: { 
        rawResourceId: "raw-id-123", 
        wikiPageId: "wiki-123", 
        slug: "session-idle-test",
        processed: true
      } 
    };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "session.created", 
      properties: { 
        sessionID: "session-idle-test" 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "session-idle-test", id: "msg-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "session-idle-test", messageID: "msg-1", type: "text", text: "Test message" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "session-idle-test", id: "msg-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "session-idle-test", messageID: "msg-2", type: "text", text: "Response" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "session.idle", 
      properties: { 
        sessionID: "session-idle-test" 
      } 
    } as any });

    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/session-idle-test");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    expect(fetchCalls[2].url).toBe("http://localhost:3000/api/ingest/llm/raw-id-123");
    expect(fetchCalls[2].options?.method).toBe("POST");
  });

  it("normalizes session IDs with timestamps to stable session name", async () => {
    mockResponses["/api/raw-resources/session/ses-249c"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-timestamp-id", filename: "session-ses-249c.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-249c-2026-04-22t17-30-31-649z", id: "msg-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "ses-249c-2026-04-22t17-30-31-649z", messageID: "msg-1", type: "text", text: "First message" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-249c-2026-04-22t17-35-00-123z", id: "msg-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
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

  it("accumulates messages from session IDs with different timestamps into same file", async () => {
    mockResponses["/api/raw-resources/session/ses-accum"] = { error: "Raw resource not found for session" };
    mockResponses["/api/raw-resources"] = { id: "raw-accumulated-id", filename: "session-ses-accum.txt" };

    const hooks = await SibylPlugin({} as any, { 
      serverUrl: "http://localhost:3000",
      autoSave: true,
      autoSaveThreshold: 2
    });

    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-accum-2026-04-22t17-30-31-649z", id: "msg-accum-1", role: "user", time: { created: 1000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "ses-accum-2026-04-22t17-30-31-649z", messageID: "msg-accum-1", type: "text", text: "First" } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.updated", 
      properties: { 
        info: { sessionID: "ses-accum-2026-04-22t17-35-00-123z", id: "msg-accum-2", role: "assistant", time: { created: 2000 } } 
      } 
    } as any });
    await hooks.event?.({ event: { 
      type: "message.part.updated", 
      properties: { 
        part: { sessionID: "ses-accum-2026-04-22t17-35-00-123z", messageID: "msg-accum-2", type: "text", text: "Second" } 
      } 
    } as any });

    expect(fetchCalls.length).toBe(2);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/raw-resources/session/ses-accum");
    expect(fetchCalls[1].url).toBe("http://localhost:3000/api/raw-resources");
    const body = fetchCalls[1].options?.body as any;
    expect(body?.filename).toBe("session-ses-accum.txt");
    expect(body?.content).toContain("First");
    expect(body?.content).toContain("Second");
  });
});
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SibylPlugin } from "./index.js";

interface MockFetchCall {
  url: string;
  options?: { method?: string; body?: unknown };
}

let originalFetch: typeof fetch;
let fetchCalls: MockFetchCall[] = [];
let mockResponses: Record<string, unknown> = {};

function mockFetch(url: string | URL | Request, options?: RequestInit): Promise<Response> {
  const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  fetchCalls.push({
    url: urlString,
    options: {
      method: options?.method,
      body: options?.body ? JSON.parse(options.body as string) : undefined,
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

  it("returns hooks with tool definitions", async () => {
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
    expect(hooks.tool?.memory_save).toBeDefined();
    expect(hooks.tool?.memory_list).toBeDefined();
    expect(hooks.tool?.memory_delete).toBeDefined();
    expect(hooks.tool?.memory_ingest).toBeDefined();
    expect(hooks.tool?.memory_query).toBeDefined();
    expect(hooks.tool?.memory_log).toBeDefined();
  });

  it("memory_recall tool fetches wiki pages with search query", async () => {
    mockResponses["/api/wiki-pages?search=test&limit=5"] = {
      data: [
        { slug: "test-page", title: "Test Page", type: "concept", summary: "A test summary", tags: ["test"] },
      ],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_recall?.execute({ query: "test", limit: 5 }, {} as any);

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toContain("search=test");
    expect(result).toContain("Test Page");
    expect(result).toContain("concept");
  });

  it("memory_recall returns no results message when empty", async () => {
    mockResponses["/api/wiki-pages?search=empty&limit=5"] = { data: [] };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_recall?.execute({ query: "empty", limit: 5 }, {} as any);

    expect(result).toBe("No memories found matching the query.");
  });

  it("memory_save tool creates wiki page", async () => {
    mockResponses["/api/wiki-pages"] = { id: "test-id", slug: "my-test-page" };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_save?.execute(
      { title: "My Test Page", type: "concept", content: "Test content" },
      {} as any
    );

    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/wiki-pages");
    expect(fetchCalls[0].options?.method).toBe("POST");
    const body = fetchCalls[0].options?.body as any;
    expect(body?.slug).toBe("my-test-page");
    expect(result).toContain("Memory saved successfully");
  });

  it("memory_list tool fetches all wiki pages", async () => {
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
    expect(result).toContain("Found 2 memories");
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

  it("memory_delete tool deletes wiki page", async () => {
    mockResponses["/api/wiki-pages/test-slug"] = { success: true };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_delete?.execute({ slug: "test-slug" }, {} as any);

    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/wiki-pages/test-slug");
    expect(fetchCalls[0].options?.method).toBe("DELETE");
    expect(result).toContain("Memory deleted successfully");
  });

  it("memory_ingest tool ingests text content", async () => {
    mockResponses["/api/ingest/text"] = {
      rawResourceId: "raw-1",
      wikiPageId: "wiki-1",
      slug: "test-file",
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_ingest?.execute(
      { filename: "test-file.txt", content: "Test content", type: "text" },
      {} as any
    );

    expect(fetchCalls[0].url).toBe("http://localhost:3000/api/ingest/text");
    expect(fetchCalls[0].options?.method).toBe("POST");
    expect(result).toContain("Content ingested successfully");
  });

  it("memory_query tool queries knowledge base", async () => {
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
              { title: "Test Result", type: "concept", summary: "Test summary", slug: "test-result" },
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

    const result = await hooks.tool?.memory_query?.execute({ question: "test question" }, {} as any);

    expect(fetchCalls[0].url).toContain("search=test");
    expect(result).toContain("Based on 1 relevant pages");
    expect(result).toContain("Test Result");
  });

  it("memory_log tool fetches processing log", async () => {
    mockResponses["/api/processing-log?limit=10"] = {
      data: [
        { id: "log-1", operation: "ingest", createdAt: Date.now(), details: {} },
        { id: "log-2", operation: "query", createdAt: Date.now(), details: {} },
      ],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_log?.execute({ limit: 10 }, {} as any);

    expect(fetchCalls[0].url).toContain("limit=10");
    expect(result).toContain("Recent operations");
    expect(result).toContain("ingest");
    expect(result).toContain("query");
  });

  it("memory_log filters by operation", async () => {
    mockResponses["/api/processing-log?limit=5&operation=ingest"] = {
      data: [{ id: "log-1", operation: "ingest", createdAt: Date.now() }],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    const result = await hooks.tool?.memory_log?.execute({ limit: 5, operation: "ingest" }, {} as any);

    expect(fetchCalls[0].url).toContain("operation=ingest");
    expect(result).toContain("ingest");
  });

  it("system transform hook injects memory context", async () => {
    mockResponses["/api/wiki-pages?limit=5"] = {
      data: [
        { title: "Memory 1", type: "concept", summary: "Summary 1", slug: "memory-1" },
        { title: "Memory 2", type: "entity", summary: "Summary 2", slug: "memory-2" },
      ],
    };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000", autoInject: true });

    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]?.({ sessionID: "test", model: {} as any }, output);

    expect(fetchCalls.length).toBe(1);
    expect(output.system.length).toBeGreaterThan(0);
    expect(output.system[0]).toContain("Sibyl Memory Context");
    expect(output.system[0]).toContain("Memory 1");
    expect(output.system[0]).toContain("memory_recall");
  });

  it("system transform hook is skipped when autoInject is false", async () => {
    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000", autoInject: false });

    const output = { system: [] as string[] };
    await hooks["experimental.chat.system.transform"]?.({ sessionID: "test", model: {} as any }, output);

    expect(fetchCalls.length).toBe(0);
    expect(output.system.length).toBe(0);
  });

  it("uses custom server URL from options", async () => {
    mockResponses["/api/wiki-pages?search=test&limit=5"] = { data: [] };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://custom-server:4000" });

    await hooks.tool?.memory_recall?.execute({ query: "test", limit: 5 }, {} as any);

    expect(fetchCalls[0].url).toContain("http://custom-server:4000");
  });

  it("uses default server URL when not provided", async () => {
    mockResponses["/api/wiki-pages?search=test&limit=5"] = { data: [] };

    const hooks = await SibylPlugin({} as any);

    await hooks.tool?.memory_recall?.execute({ query: "test", limit: 5 }, {} as any);

    expect(fetchCalls[0].url).toContain("http://localhost:3000");
  });
});

describe("memory_save slug generation", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    mockResponses = {};
    (global as any).fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("generates slug from title", async () => {
    mockResponses["/api/wiki-pages"] = { id: "test-id", slug: "my-test-page" };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    await hooks.tool?.memory_save?.execute(
      { title: "My Test Page", type: "concept", content: "Test" },
      {} as any
    );

    const body = fetchCalls[0].options?.body as any;
    expect(body?.slug).toBe("my-test-page");
  });

  it("handles special characters in title", async () => {
    mockResponses["/api/wiki-pages"] = { id: "test-id", slug: "special-test-page" };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    await hooks.tool?.memory_save?.execute(
      { title: "Special! Test @ Page #123", type: "concept", content: "Test" },
      {} as any
    );

    const body = fetchCalls[0].options?.body as any;
    expect(body?.slug).toBe("special-test-page-123");
  });

  it("handles multiple spaces in title", async () => {
    mockResponses["/api/wiki-pages"] = { id: "test-id", slug: "multi-space-title" };

    const hooks = await SibylPlugin({} as any, { serverUrl: "http://localhost:3000" });

    await hooks.tool?.memory_save?.execute(
      { title: "Multi    Space    Title", type: "concept", content: "Test" },
      {} as any
    );

    const body = fetchCalls[0].options?.body as any;
    expect(body?.slug).toBe("multi-space-title");
  });
});
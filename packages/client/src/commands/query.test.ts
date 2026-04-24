import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runQuery } from "./query.js";

describe("Query Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "page-1",
                slug: "test-page",
                title: "Test Page",
                type: "concept",
                summary: "A test page summary",
                tags: ["test", "demo"],
              },
            ],
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call wiki-pages API with query", async () => {
    await runQuery({
      query: "test query",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000/api/wiki-pages");
    expect(url).toContain("query=test+query");
  });

  test("should include type filter when provided", async () => {
    await runQuery({
      query: "test",
      type: "concept",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("type=concept");
  });

  test("should include tags filter when provided", async () => {
    await runQuery({
      query: "test",
      tags: "ai,ml",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("tags=ai%2Cml");
  });

  test("should include limit when provided", async () => {
    await runQuery({
      query: "test",
      limit: 5,
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("limit=5");
  });

  test("should call synthesize API when synthesize flag is true", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              query: "What is AI?",
              answer: "AI is artificial intelligence [[ai-overview]].",
              citations: [{ pageSlug: "ai-overview", pageTitle: "AI Overview", relevanceScore: 100 }],
              model: "test-model",
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runQuery({
      query: "What is AI?",
      synthesize: true,
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000/api/synthesize");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.query).toBe("What is AI?");
  });

  test("should handle empty results", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runQuery({
      query: "nonexistent",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle API errors", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "Not found" }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runQuery({
      query: "test",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use default server URL when not provided", async () => {
    delete process.env.SIBYL_SERVER_URL;

    await runQuery({
      query: "test",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000");
  });
});
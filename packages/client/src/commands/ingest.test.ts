import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runIngest } from "./ingest.js";

describe("Ingest Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              rawResourceId: "raw-123",
              wikiPageId: "wiki-456",
              slug: "test-document",
              title: "Test Document",
              type: "concept",
              processed: true,
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call ingest API with content", async () => {
    await runIngest({
      content: "This is test content",
      type: "text",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/ingest/text");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.content).toBe("This is test content");
  });

  test("should include title when provided", async () => {
    await runIngest({
      content: "Test content",
      title: "Custom Title",
      server: "http://localhost:3000",
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.title).toBe("Custom Title");
  });

  test("should include tags when provided", async () => {
    await runIngest({
      content: "Test content",
      tags: "ai, machine-learning, test",
      server: "http://localhost:3000",
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.tags).toEqual(["ai", "machine-learning", "test"]);
  });

  test("should handle API errors", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: false,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({ error: "Server error" }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runIngest({
      content: "Test content",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER = "http://custom-server:8080";

    await runIngest({
      content: "Test content",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://custom-server:8080/api/ingest/text");

    delete process.env.SIBYL_SERVER;
  });

  test("should handle network errors", async () => {
    mockFetch = mock(() => Promise.reject(new Error("Network failed")));
    global.fetch = mockFetch;

    await runIngest({
      content: "Test content",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runFile } from "./file.js";

describe("File Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              wikiPageId: "wiki-123",
              slug: "filed-page",
              title: "Filed Page",
              type: "summary",
              linkedPages: ["page-1", "page-2"],
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call filing API with content", async () => {
    await runFile({
      title: "Test Filed Page",
      content: "This is filed content",
      type: "summary",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/filing");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.title).toBe("Test Filed Page");
    expect(body.content).toBe("This is filed content");
    expect(body.type).toBe("summary");
  });

  test("should include tags when provided", async () => {
    await runFile({
      title: "Test Page",
      content: "Test content",
      tags: "research, notes",
      server: "http://localhost:3000",
    });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.tags).toEqual(["research", "notes"]);
  });

  test("should call filing/query API when query is provided", async () => {
    await runFile({
      title: "Query Result Page",
      query: "What is AI?",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/filing/query");
    const body = JSON.parse(options.body);
    expect(body.query).toBe("What is AI?");
  });

  test("should fail when neither content nor query provided", async () => {
    await runFile({
      title: "Test Page",
      server: "http://localhost:3000",
    });

    expect(mockFetch).not.toHaveBeenCalled();
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

    await runFile({
      title: "Test Page",
      content: "Test content",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle network errors", async () => {
    mockFetch = mock(() => Promise.reject(new Error("Network failed")));
    global.fetch = mockFetch;

    await runFile({
      title: "Test Page",
      content: "Test content",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER_URL = "http://custom-server:8080";

    await runFile({
      title: "Test",
      content: "Test",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://custom-server:8080/api/filing");

    delete process.env.SIBYL_SERVER_URL;
  });
});
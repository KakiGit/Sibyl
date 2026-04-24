import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runList } from "./list.js";

describe("List Command", () => {
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
                summary: "A test page",
                tags: ["test"],
                updatedAt: Date.now(),
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

  test("should call wiki-pages API", async () => {
    await runList({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000/api/wiki-pages");
    expect(options.method).toBe("GET");
  });

  test("should include type filter when provided", async () => {
    await runList({
      type: "concept",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("type=concept");
  });

  test("should include tags filter when provided", async () => {
    await runList({
      tags: "ai,ml",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("tags=ai%2Cml");
  });

  test("should include limit when provided", async () => {
    await runList({
      limit: 5,
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("limit=5");
  });

  test("should handle empty results", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runList({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
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

    await runList({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use default server URL when not provided", async () => {
    delete process.env.SIBYL_SERVER_URL;

    await runList({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000");
  });
});
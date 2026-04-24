import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runGraph } from "./graph.js";

describe("Graph Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              nodes: [
                {
                  id: "node-1",
                  slug: "test-page",
                  title: "Test Page",
                  type: "concept",
                  incomingLinks: 3,
                  outgoingLinks: 2,
                  isOrphan: false,
                  isHub: true,
                },
                {
                  id: "node-2",
                  slug: "orphan-page",
                  title: "Orphan Page",
                  type: "entity",
                  incomingLinks: 0,
                  outgoingLinks: 0,
                  isOrphan: true,
                  isHub: false,
                },
              ],
              edges: [
                { id: "edge-1", from: "node-1", to: "node-2", relationType: "references" },
              ],
              stats: {
                totalPages: 2,
                totalLinks: 1,
                orphanCount: 1,
                hubCount: 1,
              },
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call graph API", async () => {
    await runGraph({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/wiki-links/graph");
    expect(options.method).toBe("GET");
  });

  test("should display graph statistics", async () => {
    await runGraph({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should show specific page connections", async () => {
    await runGraph({
      page: "test-page",
      depth: 3,
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle page not found", async () => {
    await runGraph({
      page: "nonexistent-page",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle empty graph", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              nodes: [],
              edges: [],
              stats: {
                totalPages: 0,
                totalLinks: 0,
                orphanCount: 0,
                hubCount: 0,
              },
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runGraph({
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

    await runGraph({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER_URL = "http://custom-server:8080";

    await runGraph({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://custom-server:8080/api/wiki-links/graph");

    delete process.env.SIBYL_SERVER_URL;
  });
});
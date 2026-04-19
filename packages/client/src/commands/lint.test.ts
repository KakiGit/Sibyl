import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runLint } from "./lint.js";

describe("Lint Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              totalPages: 10,
              totalPagesWithIssues: 0,
              issues: [],
              orphanPages: [],
              stalePages: [],
              suggestions: ["Wiki is in good health. No issues detected."],
              lintedAt: Date.now(),
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call lint API", async () => {
    await runLint({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/lint");
    expect(options.method).toBe("POST");
  });

  test("should display healthy wiki message when no issues", async () => {
    await runLint({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle issues found", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              totalPages: 10,
              totalPagesWithIssues: 2,
              issues: [
                {
                  type: "orphan",
                  severity: "medium",
                  pageSlug: "orphan-page",
                  pageTitle: "Orphan Page",
                  details: "Page has no links",
                  suggestedAction: "Add cross-references",
                },
              ],
              orphanPages: [{ slug: "orphan-page", title: "Orphan Page" }],
              stalePages: [],
              suggestions: ["Consider linking orphan pages"],
              lintedAt: Date.now(),
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runLint({
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

    await runLint({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle network errors", async () => {
    mockFetch = mock(() => Promise.reject(new Error("Network failed")));
    global.fetch = mockFetch;

    await runLint({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER = "http://custom-server:8080";

    await runLint({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://custom-server:8080/api/lint");

    delete process.env.SIBYL_SERVER;
  });
});
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runExport } from "./export.js";
import { existsSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Export Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;
  let testOutputDir: string;

  beforeEach(() => {
    testOutputDir = join(tmpdir(), `sibyl-export-test-${Date.now()}`);
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              exportedAt: Date.now(),
              format: "json",
              totalPages: 2,
              pages: [
                {
                  id: "page-1",
                  slug: "test-page",
                  title: "Test Page",
                  type: "concept",
                  summary: "A test page",
                  tags: ["test"],
                  content: "Test content",
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
                {
                  id: "page-2",
                  slug: "another-page",
                  title: "Another Page",
                  type: "entity",
                  tags: [],
                  content: "More content",
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  test("should call export API", async () => {
    await runExport({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000/api/export");
    expect(options.method).toBe("GET");
  });

  test("should use json format by default", async () => {
    await runExport({
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("format=json");
  });

  test("should use markdown format when specified", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              exportedAt: Date.now(),
              format: "markdown",
              totalPages: 2,
              markdown: "# Sibyl Wiki Export\n\nTest markdown content",
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runExport({
      format: "markdown",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("format=markdown");
  });

  test("should include type filter when provided", async () => {
    await runExport({
      type: "concept",
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("type=concept");
  });

  test("should include links by default", async () => {
    await runExport({
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("includeLinks=true");
  });

  test("should exclude links when set to false", async () => {
    await runExport({
      includeLinks: false,
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("includeLinks=false");
  });

  test("should include content by default", async () => {
    await runExport({
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("includeContent=true");
  });

  test("should exclude content when set to false", async () => {
    await runExport({
      includeContent: false,
      server: "http://localhost:3000",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("includeContent=false");
  });

  test("should write to output file", async () => {
    const outputPath = join(testOutputDir, "export.json");

    await runExport({
      output: outputPath,
      server: "http://localhost:3000",
    });

    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.format).toBe("json");
    expect(parsed.totalPages).toBe(2);
  });

  test("should write markdown file when format is markdown", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              exportedAt: Date.now(),
              format: "markdown",
              totalPages: 1,
              markdown: "# Sibyl Wiki Export\n\nTest content",
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    const outputPath = join(testOutputDir, "export.md");

    await runExport({
      format: "markdown",
      output: outputPath,
      server: "http://localhost:3000",
    });

    expect(existsSync(outputPath)).toBe(true);
    const content = readFileSync(outputPath, "utf-8");
    expect(content).toContain("# Sibyl Wiki Export");
  });

  test("should handle empty export", async () => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              exportedAt: Date.now(),
              format: "json",
              totalPages: 0,
              pages: [],
            },
          }),
      } as Response)
    );
    global.fetch = mockFetch;

    await runExport({
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

    await runExport({
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use default server URL when not provided", async () => {
    delete process.env.SIBYL_SERVER;

    await runExport({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("http://localhost:3000");
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER = "http://custom-server:8080";

    await runExport({});

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("http://custom-server:8080");

    delete process.env.SIBYL_SERVER;
  });
});
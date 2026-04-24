import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { runDelete } from "./delete.js";

describe("Delete Command", () => {
  const originalFetch = global.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response)
    );
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should call wiki-pages delete API when page is provided", async () => {
    await runDelete({
      page: "test-page",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/wiki-pages/test-page");
    expect(options.method).toBe("DELETE");
  });

  test("should call raw-resources delete API when resource is provided", async () => {
    await runDelete({
      resource: "raw-123",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/raw-resources/raw-123");
    expect(options.method).toBe("DELETE");
  });

  test("should fail when neither page nor resource provided", async () => {
    await runDelete({
      server: "http://localhost:3000",
    });

    expect(mockFetch).not.toHaveBeenCalled();
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

    await runDelete({
      page: "nonexistent",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should handle network errors", async () => {
    mockFetch = mock(() => Promise.reject(new Error("Network failed")));
    global.fetch = mockFetch;

    await runDelete({
      page: "test-page",
      server: "http://localhost:3000",
    });

    expect(mockFetch).toHaveBeenCalled();
  });

  test("should use environment variable for server URL", async () => {
    process.env.SIBYL_SERVER_URL = "http://custom-server:8080";

    await runDelete({
      page: "test",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("http://custom-server:8080/api/wiki-pages/test");

    delete process.env.SIBYL_SERVER_URL;
  });
});
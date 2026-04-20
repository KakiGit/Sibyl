import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiStatsView } from "../components/wiki-stats";

let originalFetch: typeof fetch;

const mockStats = {
  totalPages: 10,
  pagesByType: {
    entity: 3,
    concept: 4,
    source: 2,
    summary: 1,
  },
  totalTags: 5,
  tagsDistribution: {
    ai: 3,
    ml: 2,
    python: 1,
  },
  averageContentLength: 500,
  totalContentLength: 5000,
  recentPages: [
    { id: "1", slug: "recent-1", title: "Recent Page 1", type: "concept", updatedAt: Date.now() },
    { id: "2", slug: "recent-2", title: "Recent Page 2", type: "entity", updatedAt: Date.now() - 1000 },
  ],
  oldestPage: { id: "old", slug: "old-page", title: "Old Page", createdAt: Date.now() - 100000 },
  newestPage: { id: "new", slug: "new-page", title: "New Page", createdAt: Date.now() },
  pagesWithSummary: 5,
  pagesWithTags: 7,
  pagesWithLinks: 3,
};

const mockActivity = {
  last24Hours: 2,
  lastWeek: 3,
  lastMonth: 4,
  older: 1,
};

const mockTags = [
  { tag: "ai", count: 3 },
  { tag: "ml", count: 2 },
  { tag: "python", count: 1 },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("WikiStatsView", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should display loading state initially", () => {
    (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;
    
    render(<WikiStatsView />, { wrapper: createWrapper() });
    
    expect(screen.getByText("Wiki Statistics")).toBeTruthy();
  });

  it("should display stats after loading", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("10")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Total Pages")).toBeTruthy();
      expect(screen.getByText("Total Tags")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
    });
  });

  it("should display page type distribution", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Pages by Type")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Entities")).toBeTruthy();
      expect(screen.getByText("Concepts")).toBeTruthy();
      expect(screen.getByText("Sources")).toBeTruthy();
      expect(screen.getByText("Summaries")).toBeTruthy();
    });
  });

  it("should display recent activity", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Last 24 hours")).toBeTruthy();
      expect(screen.getByText("Last 7 days")).toBeTruthy();
      expect(screen.getByText("Last 30 days")).toBeTruthy();
    });
  });

  it("should display content metrics", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Content Metrics")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Average content length")).toBeTruthy();
      expect(screen.getByText("Pages with wiki links")).toBeTruthy();
      expect(screen.getByText("Pages with summary")).toBeTruthy();
    });
  });

  it("should display top tags", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Top Tags")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("ai")).toBeTruthy();
    });
  });

  it("should display error message when fetch fails", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: false,
    } as Response);

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Failed to load wiki statistics")).toBeTruthy();
    });
  });

  it("should display recently updated pages", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Recently Updated")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Recent Page 1")).toBeTruthy();
    });
  });

  it("should display timeline information", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/api/wiki-stats")) {
        return {
          ok: true,
          json: async () => ({ data: mockStats }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/activity")) {
        return {
          ok: true,
          json: async () => ({ data: mockActivity }),
        } as Response;
      }
      if (urlString.includes("/api/wiki-stats/tags")) {
        return {
          ok: true,
          json: async () => ({ data: mockTags }),
        } as Response;
      }
      return { ok: false } as Response;
    };

    render(<WikiStatsView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Timeline")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("First page created")).toBeTruthy();
      expect(screen.getByText("Latest page created")).toBeTruthy();
    });
  });
});
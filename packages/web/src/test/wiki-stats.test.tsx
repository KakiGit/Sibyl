import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiStatsView } from "../components/wiki-stats";

const mockStats = {
  totalPages: 10,
  pagesByType: { entity: 3, concept: 4, source: 2, summary: 1 },
  totalTags: 5,
  tagsDistribution: { ai: 3, ml: 2, python: 1 },
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

const mockActivity = { last24Hours: 2, lastWeek: 3, lastMonth: 4, older: 1 };
const mockTags = [{ tag: "ai", count: 3 }, { tag: "ml", count: 2 }, { tag: "python", count: 1 }];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createMockFetch(stats = mockStats, activity = mockActivity, tags = mockTags) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/api/wiki-stats/activity")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: activity }) });
    }
    if (url.includes("/api/wiki-stats/tags")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: tags }) });
    }
    if (url.includes("/api/wiki-stats")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: stats }) });
    }
    return Promise.resolve({ ok: false });
  });
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe("WikiStatsView", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", createMockFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("displays wiki statistics header", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Wiki Statistics")).toBeTruthy());
  });

  it("displays total pages count after loading", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("10")).toBeTruthy(), { timeout: 5000 });
  });

  it("displays page type distribution", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Pages by Type")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => {
      expect(screen.getByText("Entities")).toBeTruthy();
      expect(screen.getByText("Concepts")).toBeTruthy();
    }, { timeout: 5000 });
  });

  it("displays content metrics", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Content Metrics")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText("Average content length")).toBeTruthy(), { timeout: 5000 });
  });

  it("displays top tags", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Top Tags")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText("ai")).toBeTruthy(), { timeout: 5000 });
  });

  it("displays recently updated pages", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Recently Updated")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText("Recent Page 1")).toBeTruthy(), { timeout: 5000 });
  });

  it("displays timeline information", async () => {
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText("Timeline")).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => {
      expect(screen.getByText("First page created")).toBeTruthy();
      expect(screen.getByText("Latest page created")).toBeTruthy();
    }, { timeout: 5000 });
  });

  it("displays error message when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    renderWithClient(<WikiStatsView />);
    await waitFor(() => expect(screen.getByText(/Failed to load wiki statistics/)).toBeTruthy(), { timeout: 5000 });
  }, 10000);
});
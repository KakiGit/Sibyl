import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiLint } from "../components/wiki-lint";

let originalFetch: typeof fetch;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const mockLintReport = {
  data: {
    totalPages: 10,
    totalPagesWithIssues: 5,
    issues: [
      {
        type: "orphan",
        severity: "medium",
        pageId: "page-1",
        pageSlug: "test-page",
        pageTitle: "Test Page",
        details: "Page has no incoming or outgoing links",
        suggestedAction: "Add cross-references to related pages",
      },
      {
        type: "missing_reference",
        severity: "high",
        pageId: "page-2",
        pageSlug: "api-docs",
        pageTitle: "API Documentation",
        details: "References missing page [[config-guide]]",
        suggestedAction: "Create the missing page",
      },
      {
        type: "stale",
        severity: "low",
        pageId: "page-3",
        pageSlug: "old-notes",
        pageTitle: "Old Notes",
        details: "Page has not been updated in 30 days",
        suggestedAction: "Review and update content",
      },
      {
        type: "potential_conflict",
        severity: "medium",
        pageId: "page-4",
        pageSlug: "duplicate-content",
        pageTitle: "Duplicate Content",
        details: "Similar content exists in multiple pages",
        suggestedAction: "Merge or differentiate pages",
      },
    ],
    orphanPages: [
      { id: "page-1", slug: "test-page", title: "Test Page", type: "concept", updatedAt: Date.now() },
    ],
    stalePages: [
      { id: "page-3", slug: "old-notes", title: "Old Notes", type: "entity", updatedAt: Date.now() - 30 * 24 * 60 * 60 * 1000 },
    ],
    missingReferences: [
      { fromPage: { id: "page-2", slug: "api-docs", title: "API Documentation", type: "source", updatedAt: Date.now() }, referencedSlug: "config-guide" },
    ],
    potentialConflicts: [
      { page1: { id: "page-4", slug: "duplicate-content", title: "Duplicate Content", type: "summary", updatedAt: Date.now() }, page2: { id: "page-5", slug: "similar-content", title: "Similar Content", type: "summary", updatedAt: Date.now() }, reason: "Overlapping concepts" },
    ],
    suggestions: [
      "Consider linking orphan pages to the wiki index",
      "Create missing referenced pages",
    ],
    lintedAt: Date.now(),
  },
};

describe("WikiLint Search and Filter", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders search input for lint issues", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search issues...")).toBeTruthy();
    });
  });

  it("filters issues by search query on page title", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "API" } });

    await waitFor(() => {
      expect(screen.queryByText("Test Page")).toBeFalsy();
      expect(screen.getByText("API Documentation")).toBeTruthy();
    });
  });

  it("filters issues by search query on details", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "missing page" } });

    await waitFor(() => {
      expect(screen.queryByText("Test Page")).toBeFalsy();
      expect(screen.getByText("API Documentation")).toBeTruthy();
    });
  });

  it("filters issues by search query on slug", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "api-docs" } });

    await waitFor(() => {
      expect(screen.queryByText("Test Page")).toBeFalsy();
      expect(screen.getByText("API Documentation")).toBeTruthy();
    });
  });

  it("shows no results message when search yields no matches", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "nonexistent" } });

    await waitFor(() => {
      expect(screen.getByText(/No issues with/)).toBeTruthy();
    });
  });

  it("clears search and shows all issues", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "API" } });

    await waitFor(() => {
      expect(screen.queryByText("Test Page")).toBeFalsy();
    });

    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });
  });

  it("combines search with severity filter", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "" } });

    const highButton = screen.getByRole("button", { name: "High" });
    fireEvent.click(highButton);

    await waitFor(() => {
      expect(screen.queryByText("Test Page")).toBeFalsy();
      expect(screen.getByText("API Documentation")).toBeTruthy();
    });
  });

  it("search is case-insensitive", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockLintReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "test page" } });

    await waitFor(() => {
      expect(screen.getByText("Test Page")).toBeTruthy();
      expect(screen.queryByText("API Documentation")).toBeFalsy();
    });
  });

  it("resets pagination when search query changes", async () => {
    const largeReport = {
      data: {
        ...mockLintReport.data,
        issues: Array.from({ length: 50 }, (_, i) => ({
          type: "orphan",
          severity: "medium",
          pageId: `page-${i}`,
          pageSlug: `page-${i}`,
          pageTitle: `Page ${i}`,
          details: `Issue ${i} details`,
          suggestedAction: "Fix this issue",
        })),
      },
    };

    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => largeReport,
    } as Response);

    render(<WikiLint />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Page 0")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText("Search issues...");
    fireEvent.change(searchInput, { target: { value: "Page 25" } });

    await waitFor(() => {
      expect(screen.getByText("Page 25")).toBeTruthy();
    });
  });
});
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiSearch } from "@/components/wiki-search";
import { ToastProvider } from "@/components/toast";

const mockSearchResponse = {
  data: [
    {
      page: {
        id: "test-1",
        slug: "machine-learning",
        title: "Machine Learning",
        type: "concept",
        summary: "A branch of AI",
        tags: ["ai", "ml"],
        updatedAt: Date.now(),
      },
      keywordScore: 80,
      semanticScore: 0.75,
      combinedScore: 0.78,
      matchType: "hybrid",
    },
    {
      page: {
        id: "test-2",
        slug: "neural-networks",
        title: "Neural Networks",
        type: "concept",
        summary: "Computing systems inspired by biological neural networks",
        tags: ["ai", "deep-learning"],
        updatedAt: Date.now(),
      },
      keywordScore: 60,
      semanticScore: 0.65,
      combinedScore: 0.62,
      matchType: "keyword",
    },
  ],
};

const mockRebuildResponse = {
  data: { indexed: 5 },
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
};

describe("WikiSearch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("should render search input", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByPlaceholderText("Enter search query...")).toBeInTheDocument();
  });

  it("should render type filter select", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Filter by Type")).toBeInTheDocument();
  });

  it("should render tags input", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Tags (comma-separated)")).toBeInTheDocument();
  });

  it("should render limit input", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Result Limit")).toBeInTheDocument();
  });

  it("should render semantic search checkbox", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Semantic Search")).toBeInTheDocument();
  });

  it("should render search button", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });

  it("should render clear button", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("should render rebuild index button", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: "Rebuild Index" })).toBeInTheDocument();
  });

  it("should disable search button when query is empty", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton).toBeDisabled();
  });

  it("should enable search button when query is entered", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });
    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });
    const searchButton = screen.getByRole("button", { name: "Search" });
    expect(searchButton).toBeEnabled();
  });

  it("should perform search when form is submitted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const fetchCall = mockFetch.mock.calls[0];
    expect(fetchCall[0]).toBe("/api/wiki-pages/search");
    expect(fetchCall[1].method).toBe("POST");
    const body = JSON.parse(fetchCall[1].body);
    expect(body.query).toBe("machine learning");
  });

  it("should display search results after successful search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
      expect(screen.getByText("Neural Networks")).toBeInTheDocument();
    });
  });

  it("should display result count after search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Found 2 results for \"machine learning\"")).toBeInTheDocument();
    });
  });

  it("should display match type badges on results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const hybridBadges = screen.getAllByText("Hybrid");
    const keywordBadges = screen.getAllByText("Keyword");
    expect(hybridBadges.length).toBeGreaterThan(0);
    expect(keywordBadges.length).toBeGreaterThan(0);
  });

  it("should display page type badges on results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const conceptBadges = screen.getAllByText("Concept");
    expect(conceptBadges.length).toBeGreaterThanOrEqual(2);
  });

  it("should display tags on results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "machine learning" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const aiBadges = screen.getAllByText("ai");
    const mlBadges = screen.getAllByText("ml");
    expect(aiBadges.length).toBeGreaterThan(0);
    expect(mlBadges.length).toBeGreaterThan(0);
  });

  it("should show no results message when search returns empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "nonexistent" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText("No results found for this query.")).toBeInTheDocument();
    });
  });

  it("should show error message when search fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "Search failed" }),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "test" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      const errorElements = screen.getAllByText("Search failed");
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  it("should clear form when clear button clicked", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "test query" } });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
  });

  it("should rebuild index when rebuild button clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRebuildResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const rebuildButton = screen.getByRole("button", { name: "Rebuild Index" });
    fireEvent.click(rebuildButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/wiki-pages/search/rebuild-index", {
        method: "POST",
      });
    });
  });

  it("should show success message after index rebuild", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRebuildResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const rebuildButton = screen.getByRole("button", { name: "Rebuild Index" });
    fireEvent.click(rebuildButton);

    await waitFor(() => {
      expect(screen.getByText("Search index rebuilt! Indexed 5 pages.")).toBeInTheDocument();
    });
  });

  it("should toggle semantic search checkbox", () => {
    render(<WikiSearch />, { wrapper: createWrapper() });

    const checkbox = screen.getByLabelText("Semantic Search");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("should search with type filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "test" } });

    const typeSelect = screen.getByLabelText("Filter by Type");
    fireEvent.change(typeSelect, { target: { value: "concept" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.type).toBe("concept");
  });

  it("should search with tags filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "test" } });

    const tagsInput = screen.getByLabelText("Tags (comma-separated)");
    fireEvent.change(tagsInput, { target: { value: "ai, ml" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.tags).toBe("ai,ml");
  });

  it("should search with custom limit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSearchResponse),
    });

    render(<WikiSearch />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Enter search query...");
    fireEvent.change(input, { target: { value: "test" } });

    const limitInput = screen.getByLabelText("Result Limit");
    fireEvent.change(limitInput, { target: { value: "20" } });

    const searchButton = screen.getByRole("button", { name: "Search" });
    fireEvent.click(searchButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.limit).toBe(20);
  });
});
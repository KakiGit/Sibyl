import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuerySynthesis } from "@/components/query-synthesis";

const mockSynthesizeResult = {
  data: {
    query: "What is React?",
    answer:
      "React is a JavaScript library for building user interfaces [[react-overview]]. It uses a component-based architecture [[react-overview]].",
    citations: [
      {
        pageSlug: "react-overview",
        pageTitle: "React Overview",
        pageType: "concept",
        relevanceScore: 100,
      },
    ],
    synthesizedAt: Date.now(),
    model: "mock-model",
    filedPage: {
      wikiPageId: "test-wiki-id",
      slug: "query-result-what-is-react",
      title: "Query Result: What is React?",
      type: "summary",
      linkedPages: ["react-overview"],
      filedAt: Date.now(),
    },
  },
};

const mockSynthesizeResultNoCitations = {
  data: {
    query: "nonexistent query",
    answer: "No relevant wiki pages found for this query.",
    citations: [],
    synthesizedAt: Date.now(),
    filedPage: undefined,
  },
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("QuerySynthesis Auto Filing", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("should display filed status after synthesis with citations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByText(/Answer saved to Wiki Page/)).toBeInTheDocument();
    });
  });

  it("should show slug in filed status message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByText(/query-result-what-is-react/)).toBeInTheDocument();
    });
  });

  it("should show linked pages count in filed status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByText(/1 linked pages/)).toBeInTheDocument();
    });
  });

  it("should not show filed status when no citations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResultNoCitations),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "nonexistent query" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.queryByText(/Answer saved to Wiki Page/)).not.toBeInTheDocument();
    });
  });

  it("should show success message with green styling", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      const greenAlert = screen.getByText((content, element) => {
        return Boolean(element?.className?.includes?.("text-green-600") && content.includes("Answer saved"));
      });
      expect(greenAlert).toBeInTheDocument();
    });
  });

  it("should show multiple linked pages count correctly", async () => {
    const multiCitationResult = {
      data: {
        query: "What are React hooks?",
        answer: "Hooks are functions [[hooks-guide]] [[react-overview]].",
        citations: [
          {
            pageSlug: "hooks-guide",
            pageTitle: "Hooks Guide",
            pageType: "concept",
            relevanceScore: 150,
          },
          {
            pageSlug: "react-overview",
            pageTitle: "React Overview",
            pageType: "concept",
            relevanceScore: 100,
          },
        ],
        synthesizedAt: Date.now(),
        filedPage: {
          wikiPageId: "test-wiki-id",
          slug: "query-result-what-are-react-hooks",
          title: "Query Result: What are React hooks?",
          type: "summary",
          linkedPages: ["hooks-guide", "react-overview"],
          filedAt: Date.now(),
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(multiCitationResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What are React hooks?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByText(/2 linked pages/)).toBeInTheDocument();
    });
  });

  it("should not show file button before synthesis", () => {
    render(<QuerySynthesis />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: "File this Answer" })).not.toBeInTheDocument();
  });

  it("should not have file button after synthesis", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByText(/Answer saved to Wiki Page/)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "File this Answer" })).not.toBeInTheDocument();
  });
});
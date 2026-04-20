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
  },
};

const mockFilingResult = {
  data: {
    wikiPageId: "test-wiki-id",
    slug: "query-result-what-is-react",
    title: "Query Result: What is React?",
    type: "summary",
    linkedPages: ["react-overview"],
    filedAt: Date.now(),
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

describe("QuerySynthesis Quick Filing", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("should display file answer button after synthesis", async () => {
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
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });
  });

  it("should file synthesized answer when button clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilingResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const filingCall = mockFetch.mock.calls[1];
      expect(filingCall[0]).toBe("/api/filing");
      expect(filingCall[1].method).toBe("POST");
      const body = JSON.parse(filingCall[1].body);
      expect(body.type).toBe("summary");
      expect(body.tags).toContain("synthesized");
      expect(body.sourcePageSlugs).toContain("react-overview");
    });
  });

  it("should show success message after filing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilingResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      const greenAlert = screen.getByText((content, element) => {
        return Boolean(element?.className?.includes?.("text-green-600") && content.includes("Answer filed"));
      });
      expect(greenAlert).toBeInTheDocument();
    });
  });

  it("should show error message when filing fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "Filing failed" }),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      expect(screen.getByText("Filing failed")).toBeInTheDocument();
    });
  });

  it("should disable file button while filing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });
    mockFetch.mockImplementationOnce(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve(mockFilingResult),
      }), 1000);
    }));

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      expect(fileButton).toBeDisabled();
    });
  });

  it("should show filing loading state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockSynthesizeResult),
    });
    mockFetch.mockImplementationOnce(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve(mockFilingResult),
      }), 1000);
    }));

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What is React?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      const fileButtons = screen.getAllByRole("button", { name: /File this Answer/ });
      expect(fileButtons[0]).toBeDisabled();
    });
  });

  it("should include citations as source pages in filing", async () => {
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
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(multiCitationResult),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockFilingResult),
    });

    render(<QuerySynthesis />, { wrapper: createWrapper() });

    const input = screen.getByPlaceholderText("Ask a question about your wiki...");
    fireEvent.change(input, { target: { value: "What are React hooks?" } });

    const synthesizeButton = screen.getByRole("button", { name: "Synthesize" });
    fireEvent.click(synthesizeButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "File this Answer" })).toBeInTheDocument();
    });

    const fileButton = screen.getByRole("button", { name: "File this Answer" });
    fireEvent.click(fileButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const filingCall = mockFetch.mock.calls[1];
      const body = JSON.parse(filingCall[1].body);
      expect(body.sourcePageSlugs).toHaveLength(2);
      expect(body.sourcePageSlugs).toContain("hooks-guide");
      expect(body.sourcePageSlugs).toContain("react-overview");
    });
  });

  it("should not show file button before synthesis", () => {
    render(<QuerySynthesis />, { wrapper: createWrapper() });

    expect(screen.queryByRole("button", { name: "File this Answer" })).not.toBeInTheDocument();
  });
});
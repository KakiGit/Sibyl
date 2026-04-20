import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MarpSlides } from "@/components/marp-slides";

const mockWikiPagesResponse = {
  data: [
    {
      id: "page-1",
      slug: "machine-learning",
      title: "Machine Learning",
      type: "concept",
      summary: "A branch of AI",
      tags: ["ai", "ml"],
    },
    {
      id: "page-2",
      slug: "neural-networks",
      title: "Neural Networks",
      type: "concept",
      summary: "Computing systems inspired by biological neural networks",
      tags: ["ai", "deep-learning"],
    },
    {
      id: "page-3",
      slug: "python-tutorial",
      title: "Python Tutorial",
      type: "source",
      summary: "Introduction to Python programming",
      tags: ["programming", "python"],
    },
  ],
};

const mockMarpResponse = {
  data: {
    marpContent: "---\nmarp: true\ntheme: default\npaginate: true\n---\n\n# Machine Learning\n\n---\n\n## Overview\n\nA branch of AI\n\n---\n\n# Neural Networks\n\n---\n\n## Overview\n\nComputing systems inspired by biological neural networks",
    slides: [
      "# Machine Learning",
      "## Overview\n\nA branch of AI",
      "# Neural Networks",
      "## Overview\n\nComputing systems inspired by biological neural networks",
    ],
    theme: "default",
    sourcePages: [
      { id: "page-1", slug: "machine-learning", title: "Machine Learning", type: "concept" },
      { id: "page-2", slug: "neural-networks", title: "Neural Networks", type: "concept" },
    ],
    title: "AI Overview",
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

describe("MarpSlides", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it("should render component title", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByText("Marp Slide Generation")).toBeInTheDocument();
  });

  it("should render mode toggle buttons", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByText("Select Pages")).toBeInTheDocument();
    expect(screen.getByText("Search Query")).toBeInTheDocument();
  });

  it("should render title input", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByPlaceholderText("Optional title for the presentation")).toBeInTheDocument();
  });

it("should render theme select", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
  });

  it("should render max pages select", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Max Pages to Include")).toBeInTheDocument();
  });

  it("should render max pages select", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Max Pages to Include")).toBeInTheDocument();
  });

  it("should render paginate checkbox", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Show slide numbers")).toBeInTheDocument();
  });

  it("should render LLM enhancement checkbox", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByLabelText("Use LLM enhancement (requires LLM configuration)")).toBeInTheDocument();
  });

  it("should render generate button", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: "Generate Slides" })).toBeInTheDocument();
  });

  it("should render clear button", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("should disable generate button when no pages selected in select mode", () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });
    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    expect(generateButton).toBeDisabled();
  });

  it("should show wiki pages for selection after loading", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
      expect(screen.getByText("Neural Networks")).toBeInTheDocument();
      expect(screen.getByText("Python Tutorial")).toBeInTheDocument();
    });
  });

  it("should switch to query mode when Search Query button clicked", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const queryButton = screen.getByText("Search Query");
    fireEvent.click(queryButton);

    expect(screen.getByPlaceholderText("Enter search query to find relevant pages...")).toBeInTheDocument();
  });

  it("should disable generate button in query mode when query is empty", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const queryButton = screen.getByText("Search Query");
    fireEvent.click(queryButton);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    expect(generateButton).toBeDisabled();
  });

  it("should enable generate button in query mode when query is entered", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const queryButton = screen.getByText("Search Query");
    fireEvent.click(queryButton);

    const queryInput = screen.getByPlaceholderText("Enter search query to find relevant pages...");
    fireEvent.change(queryInput, { target: { value: "machine learning" } });

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    expect(generateButton).toBeEnabled();
  });

  it("should select wiki pages when clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    expect(screen.getByText("1 pages selected")).toBeInTheDocument();
  });

  it("should enable generate button when pages are selected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    expect(generateButton).toBeEnabled();
  });

  it("should generate slides with selected pages", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/marp", expect.anything());
    });
  });

  it("should display slide generation results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Generated 4 slides from 2 pages!")).toBeInTheDocument();
    });
  });

  it("should display theme badge in results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Theme: Default")).toBeInTheDocument();
    });
  });

  it("should display source pages in results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Source Pages:")).toBeInTheDocument();
    });
  });

  it("should display copy markdown button after generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy Markdown" })).toBeInTheDocument();
    });
  });

  it("should display download button after generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Download .md" })).toBeInTheDocument();
    });
  });

  it("should show error message when generation fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "LLM not configured" }),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const llmCheckbox = screen.getByLabelText("Use LLM enhancement (requires LLM configuration)");
    fireEvent.click(llmCheckbox);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("LLM not configured")).toBeInTheDocument();
    });
  });

  it("should toggle paginate checkbox", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const checkbox = screen.getByLabelText("Show slide numbers");
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("should toggle LLM enhancement checkbox", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const checkbox = screen.getByLabelText("Use LLM enhancement (requires LLM configuration)");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("should change theme selection", () => {
    render(<MarpSlides />, { wrapper: createWrapper() });

    const themeSelect = screen.getByLabelText("Theme");
    fireEvent.change(themeSelect, { target: { value: "gaia" } });

    expect(themeSelect).toHaveValue("gaia");
  });

  it("should clear form when clear button clicked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const titleInput = screen.getByPlaceholderText("Optional title for the presentation");
    fireEvent.change(titleInput, { target: { value: "My Presentation" } });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    fireEvent.click(clearButton);

    expect(titleInput).toHaveValue("");
  });

  it("should generate slides with query mode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    const queryButton = screen.getByText("Search Query");
    fireEvent.click(queryButton);

    const queryInput = screen.getByPlaceholderText("Enter search query to find relevant pages...");
    fireEvent.change(queryInput, { target: { value: "machine learning" } });

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const marpCall = mockFetch.mock.calls.find((call: unknown[]) => (call as string[])[0] === "/api/marp");
    expect(marpCall).toBeDefined();
    const callArgs = (marpCall as unknown[])[1] as { body?: string };
    const body = JSON.parse(callArgs.body || "{}");
    expect(body.query).toBe("machine learning");
  });

  it("should display slide preview cards after generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockMarpResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Machine Learning")).toBeInTheDocument();
    });

    const pageButton = screen.getByText("Machine Learning").closest("button");
    fireEvent.click(pageButton!);

    const generateButton = screen.getByRole("button", { name: "Generate Slides" });
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Slide 1")).toBeInTheDocument();
      expect(screen.getByText("Slide 2")).toBeInTheDocument();
    });
  });

  it("should show page type badges in selection list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockWikiPagesResponse),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText("Concept")).toHaveLength(2);
      expect(screen.getByText("Source")).toBeInTheDocument();
    });
  });

  it("should show no pages message when wiki is empty", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });

    render(<MarpSlides />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("No wiki pages available. Create some pages first.")).toBeInTheDocument();
    });
  });
});
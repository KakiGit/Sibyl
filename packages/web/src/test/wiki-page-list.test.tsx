import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiPageList } from "../components/wiki-page-list";

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

describe("WikiPageList", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders loading skeleton while fetching", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(<WikiPageList />, { wrapper: createWrapper() });

    const skeletons = screen.getAllByRole("generic").filter((el) => 
      el.className.includes("animate-pulse")
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no pages exist", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/No wiki pages found/i)).toBeTruthy();
    });
  });

  it("renders wiki page cards when data exists", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "test-1",
            slug: "test-concept",
            title: "Test Concept",
            type: "concept",
            summary: "A test summary",
            tags: ["test"],
            updatedAt: Date.now(),
          },
        ],
      }),
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Concept")).toBeTruthy();
      expect(screen.getByText("A test summary")).toBeTruthy();
      expect(screen.getByText("Concept")).toBeTruthy();
    });
  });

  it("renders multiple wiki page cards", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "test-1",
            slug: "entity-1",
            title: "Entity One",
            type: "entity",
            summary: undefined,
            tags: [],
            updatedAt: Date.now(),
          },
          {
            id: "test-2",
            slug: "concept-1",
            title: "Concept One",
            type: "concept",
            summary: undefined,
            tags: [],
            updatedAt: Date.now(),
          },
        ],
      }),
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Entity One")).toBeTruthy();
      expect(screen.getByText("Concept One")).toBeTruthy();
      expect(screen.getByText("Entity")).toBeTruthy();
      expect(screen.getByText("Concept")).toBeTruthy();
    });
  });

  it("displays tags on wiki page cards", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "test-1",
            slug: "tagged-page",
            title: "Tagged Page",
            type: "concept",
            summary: undefined,
            tags: ["important", "reference", "test"],
            updatedAt: Date.now(),
          },
        ],
      }),
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("important")).toBeTruthy();
      expect(screen.getByText("reference")).toBeTruthy();
    });
  });

  it("shows error state on fetch failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load wiki pages/i)).toBeTruthy();
    });
  });

  it("fetches pages with type filter", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "test-1",
            slug: "entity-only",
            title: "Entity Only",
            type: "entity",
            summary: undefined,
            tags: [],
            updatedAt: Date.now(),
          },
        ],
      }),
    } as Response);

    render(<WikiPageList type="entity" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith("/api/wiki-pages?type=entity");
    });
  });
});
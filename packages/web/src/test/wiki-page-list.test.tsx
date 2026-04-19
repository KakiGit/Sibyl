import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiPageList } from "../components/wiki-page-list";

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

describe("WikiPageList", () => {
  let mockFetch: typeof fetch;
  let fetchCalls: { url: string; options?: RequestInit }[] = [];

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
    mockFetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchCalls.push({ url: urlString, options });
      return {
        ok: true,
        json: async () => ({ data: [] }),
      } as Response;
    };
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading skeleton while fetching", () => {
    global.fetch = async () => new Promise(() => {}) as Promise<Response>;

    render(<WikiPageList />, { wrapper: createWrapper() });

    const skeletons = screen.getAllByRole("generic").filter((el) => 
      el.className.includes("animate-pulse")
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no pages exist", async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/No wiki pages found/i)).toBeTruthy();
    });
  });

  it("renders wiki page cards when data exists", async () => {
    global.fetch = async () => ({
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
    global.fetch = async () => ({
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
    global.fetch = async () => ({
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
    global.fetch = async () => ({
      ok: false,
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load wiki pages/i)).toBeTruthy();
    });
  });

  it("fetches pages with type filter", async () => {
    global.fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchCalls.push({ url: urlString });
      return {
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
      } as Response;
    };

    render(<WikiPageList type="entity" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(fetchCalls.some(c => c.url === "/api/wiki-pages?type=entity")).toBe(true);
    });
  });
});
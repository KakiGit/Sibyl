import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiPageList } from "../components/wiki-page-list";
import { ToastProvider } from "../components/toast";

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
    <ToastProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ToastProvider>
  );
};

const mockWikiPages = [
  {
    id: "test-1",
    slug: "test-concept",
    title: "Test Concept",
    type: "concept",
    summary: "A test summary",
    tags: ["test"],
    updatedAt: Date.now(),
  },
];

describe("WikiPageList", () => {
  let fetchCalls: { url: string; options?: RequestInit }[] = [];

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading skeleton while fetching", () => {
    (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;

    render(<WikiPageList />, { wrapper: createWrapper() });

    const skeletons = screen.getAllByRole("generic").filter((el) => 
      el.className.includes("animate-pulse")
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no pages exist", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 0 }) } as Response;
      }
      return { ok: true, json: async () => ({ data: [] }) } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/No wiki pages found/i)).toBeTruthy();
    });
  });

  it("renders wiki page cards when data exists", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 1 }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockWikiPages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Concept")).toBeTruthy();
    });
  });

  it("renders multiple wiki page cards", async () => {
    const pages = [
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
    ];
    
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 2 }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: pages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Entity One")).toBeTruthy();
      expect(screen.getByText("Concept One")).toBeTruthy();
    });
  });

  it("displays tags on wiki page cards", async () => {
    const taggedPage = {
      id: "test-1",
      slug: "tagged-page",
      title: "Tagged Page",
      type: "concept",
      summary: undefined,
      tags: ["important", "reference", "test"],
      updatedAt: Date.now(),
    };
    
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 1 }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [taggedPage] }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("important")).toBeTruthy();
      expect(screen.getByText("reference")).toBeTruthy();
    });
  });

  it("shows error state on fetch failure", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: false,
    } as Response);

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load wiki pages/)).toBeTruthy();
    });
  });

  it("fetches pages with type filter", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchCalls.push({ url: urlString });
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 1 }) } as Response;
      }
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
      expect(fetchCalls.some(c => c.url.includes("type=entity"))).toBe(true);
    });
  });

  it("shows Select Multiple button", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 1 }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockWikiPages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Select Multiple")).toBeTruthy();
    });
  });

  it("shows selection controls when Select Multiple is clicked", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 2 }) } as Response;
      }
      const pages = [
        { ...mockWikiPages[0], id: "test-1" },
        { ...mockWikiPages[0], id: "test-2", slug: "test-concept-2", title: "Test Concept 2" },
      ];
      return {
        ok: true,
        json: async () => ({ data: pages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Concept")).toBeTruthy();
    });

    const selectMultipleBtn = screen.getByText("Select Multiple");
    fireEvent.click(selectMultipleBtn);

    await waitFor(() => {
      expect(screen.getByText("Select All")).toBeTruthy();
      expect(screen.getByText("Delete (0)")).toBeTruthy();
    });
  });

  it("calls batch delete API when Delete button clicked with selected items", async () => {
    let batchDeleteCalled = false;
    let deletedIds: string[] = [];
    
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchCalls.push({ url: urlString, options });
      
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 2 }) } as Response;
      }
      if (urlString.includes("batch-delete")) {
        batchDeleteCalled = true;
        const body = JSON.parse(options?.body as string || "{}");
        deletedIds = body.ids;
        return {
          ok: true,
          json: async () => ({ deleted: body.ids, failed: [], success: true }),
        } as Response;
      }
      const pages = [
        { ...mockWikiPages[0], id: "test-1" },
        { ...mockWikiPages[0], id: "test-2", slug: "test-concept-2", title: "Test Concept 2" },
      ];
      return {
        ok: true,
        json: async () => ({ data: pages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Concept")).toBeTruthy();
    });

    const selectMultipleBtn = screen.getByText("Select Multiple");
    fireEvent.click(selectMultipleBtn);

    await waitFor(() => {
      expect(screen.getByText("Select All")).toBeTruthy();
    });

    const selectAllBtn = screen.getByText("Select All");
    fireEvent.click(selectAllBtn);

    await waitFor(() => {
      expect(screen.getByText("Delete (2)")).toBeTruthy();
    });

    const deleteBtn = screen.getByText("Delete (2)");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete 2 wiki page/)).toBeTruthy();
    });

    const confirmBtn = screen.getByText("Delete");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(batchDeleteCalled).toBe(true);
      expect(deletedIds.length).toBe(2);
    });
  });

  it("shows Cancel Selection button in selection mode", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 1 }) } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockWikiPages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Select Multiple")).toBeTruthy();
    });

    const selectMultipleBtn = screen.getByText("Select Multiple");
    fireEvent.click(selectMultipleBtn);

    await waitFor(() => {
      expect(screen.getByText("Cancel Selection")).toBeTruthy();
    });
  });

  it("disables Delete button when no items selected", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/count")) {
        return { ok: true, json: async () => ({ count: 2 }) } as Response;
      }
      const pages = [
        { ...mockWikiPages[0], id: "test-1" },
        { ...mockWikiPages[0], id: "test-2", slug: "test-concept-2", title: "Test Concept 2" },
      ];
      return {
        ok: true,
        json: async () => ({ data: pages }),
      } as Response;
    };

    render(<WikiPageList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Test Concept")).toBeTruthy();
    });

    const selectMultipleBtn = screen.getByText("Select Multiple");
    fireEvent.click(selectMultipleBtn);

    await waitFor(() => {
      const deleteBtn = screen.getByText("Delete (0)");
      expect(deleteBtn.hasAttribute("disabled")).toBe(true);
    });
  });
});
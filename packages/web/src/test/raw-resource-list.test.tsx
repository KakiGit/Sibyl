import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RawResourceList } from "../components/raw-resource-list";

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

const mockResources = [
  {
    id: "raw-1",
    type: "pdf" as const,
    filename: "document.pdf",
    sourceUrl: undefined,
    contentPath: "data/raw/documents/document.pdf",
    createdAt: Date.now(),
    processed: true,
  },
  {
    id: "raw-2",
    type: "text" as const,
    filename: "notes.txt",
    sourceUrl: undefined,
    contentPath: "data/raw/documents/notes.txt",
    createdAt: Date.now() - 86400000,
    processed: false,
  },
  {
    id: "raw-3",
    type: "webpage" as const,
    filename: "article.html",
    sourceUrl: "https://example.com/article",
    contentPath: "data/raw/webpages/article.html",
    createdAt: Date.now() - 172800000,
    processed: true,
  },
  {
    id: "raw-4",
    type: "image" as const,
    filename: "photo.jpg",
    sourceUrl: undefined,
    contentPath: "data/raw/documents/photo.jpg",
    createdAt: Date.now() - 259200000,
    processed: false,
  },
];

describe("RawResourceList", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("renders loading skeleton while fetching", () => {
    (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;

    render(<RawResourceList />, { wrapper: createWrapper() });

    const skeletons = screen.getAllByRole("generic").filter((el) => 
      el.className.includes("animate-pulse")
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no resources exist", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: false,
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/No raw resources found/i)).toBeTruthy();
    });
  });

  it("renders raw resource cards when data exists", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              total: 4,
              processed: 2,
              unprocessed: 2,
              byType: { pdf: 1, text: 1, webpage: 1, image: 1 },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResources }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("document.pdf")).toBeTruthy();
      expect(screen.getByText("PDF")).toBeTruthy();
      const processedBadges = screen.getAllByText("Processed");
      expect(processedBadges.length).toBeGreaterThan(0);
    });
  });

  it("displays correct status badges for processed/unprocessed", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              total: 2,
              processed: 1,
              unprocessed: 1,
              byType: { pdf: 1, text: 1 },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0], mockResources[1]] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      const processedBadges = screen.getAllByText("Processed");
      const pendingBadges = screen.getAllByText("Pending");
      expect(processedBadges.length).toBe(1);
      expect(pendingBadges.length).toBe(1);
    });
  });

  it("displays source URL for webpages", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              total: 1,
              processed: 1,
              unprocessed: 0,
              byType: { webpage: 1 },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[2]] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("https://example.com/article")).toBeTruthy();
    });
  });

  it("shows error state on fetch failure", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: false,
    } as Response);

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load raw resources/i)).toBeTruthy();
    });
  });

  it("displays all resource type badges", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              total: 4,
              processed: 2,
              unprocessed: 2,
              byType: { pdf: 1, text: 1, webpage: 1, image: 1 },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResources }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("PDF")).toBeTruthy();
      expect(screen.getByText("Text")).toBeTruthy();
      expect(screen.getByText("Webpage")).toBeTruthy();
      expect(screen.getByText("Image")).toBeTruthy();
    });
  });

  it("renders stats display with correct values", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              stats: {
                pdfCount: 3,
                textCount: 2,
                webpageCount: 3,
                imageCount: 2,
                processedCount: 6,
                unprocessedCount: 4,
              },
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResources }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("10")).toBeTruthy();
      expect(screen.getByText("6")).toBeTruthy();
      const fours = screen.getAllByText("4");
      expect(fours.length).toBe(2);
      expect(screen.getByText("Total")).toBeTruthy();
      expect(screen.getByText("Pending")).toBeTruthy();
      expect(screen.getByText("Types")).toBeTruthy();
    });
  });

  it("has delete button on each card", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: { total: 1, processed: 0, unprocessed: 1, byType: { pdf: 1 } },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0]] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      const deleteButtons = screen.getAllByRole("button").filter(btn => 
        btn.className.includes("text-red")
      );
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  it("calls delete API when delete button clicked", async () => {
    let deleteCalled = false;
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: { total: 1, processed: 1, unprocessed: 0, byType: { pdf: 1 } },
          }),
        } as Response;
      }
      if (options?.method === "DELETE") {
        deleteCalled = true;
        return {
          ok: true,
          json: async () => ({ success: true }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0]] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("document.pdf")).toBeTruthy();
    });

    const deleteButton = screen.getAllByRole("button").find(btn => 
      btn.className.includes("text-red")
    );
    
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
  });

  it("shows refresh button", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: { total: 1, processed: 1, unprocessed: 0, byType: { pdf: 1 } },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0]] }),
      } as Response;
    };

    render(<RawResourceList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeTruthy();
    });
  });

  it("filters by type when type prop provided", async () => {
    let fetchUrl = "";
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchUrl = urlString;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: { total: 1, processed: 1, unprocessed: 0, byType: { pdf: 1 } },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0]] }),
      } as Response;
    };

    render(<RawResourceList type="pdf" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(fetchUrl).toContain("type=pdf");
    });
  });

  it("filters by processed status when processed prop provided", async () => {
    let fetchUrl = "";
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      fetchUrl = urlString;
      if (urlString.includes("/stats")) {
        return {
          ok: true,
          json: async () => ({
            data: { total: 2, processed: 2, unprocessed: 0, byType: { pdf: 2 } },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: [mockResources[0]] }),
      } as Response;
    };

    render(<RawResourceList processed={true} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(fetchUrl).toContain("processed=true");
    });
  });
});
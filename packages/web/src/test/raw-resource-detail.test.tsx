import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RawResourceDetail } from "../components/raw-resource-detail";
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

const mockResource = {
  id: "raw-1",
  type: "text" as const,
  filename: "notes.txt",
  sourceUrl: undefined,
  contentPath: "data/raw/documents/notes.txt",
  metadata: { author: "test" },
  createdAt: Date.now(),
  processed: false,
};

const mockContent = "This is some test content for the raw resource.";

describe("RawResourceDetail", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("renders loading state while fetching", () => {
    (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Loading resource content...")).toBeTruthy();
  });

  it("renders error state on fetch failure", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: false,
    } as Response);

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Failed to load raw resource")).toBeTruthy();
    });
  });

  it("renders resource details correctly", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("notes.txt")).toBeTruthy();
      const textBadges = screen.getAllByText("Text");
      expect(textBadges.length).toBeGreaterThan(0);
      const pendingBadges = screen.getAllByText("Pending");
      expect(pendingBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders processed badge for processed resources", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: { ...mockResource, processed: true } }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      const processedBadges = screen.getAllByText("Processed");
      expect(processedBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders content in a pre element", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(mockContent)).toBeTruthy();
    });
  });

  it("shows edit and delete buttons", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeTruthy();
      expect(screen.getByText("Delete")).toBeTruthy();
    });
  });

  it("shows metadata section", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Metadata")).toBeTruthy();
      expect(screen.getByText("Type")).toBeTruthy();
      expect(screen.getByText("Content Path")).toBeTruthy();
    });
  });

  it("shows source URL when present", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: { ...mockResource, sourceUrl: "https://example.com" } }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Source URL")).toBeTruthy();
      expect(screen.getByText("https://example.com")).toBeTruthy();
    });
  });

  it("enters edit mode when edit button is clicked", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeTruthy();
    });

    const editButton = screen.getByRole("button", { name: /Edit/i });
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText("Edit Content")).toBeTruthy();
      expect(screen.getByRole("textbox")).toBeTruthy();
    });
  });

  it("calls onBack when back button is clicked", async () => {
    let onBackCalled = false;
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" onBack={() => { onBackCalled = true; }} />, { wrapper: createWrapper() });

    await waitFor(() => {
      const backButton = screen.getAllByRole("button").find(btn => btn.className.includes("p-2"));
      if (backButton) {
        fireEvent.click(backButton);
      }
    });

    await waitFor(() => {
      expect(onBackCalled).toBe(true);
    });
  });

  it("shows delete confirmation dialog when delete button is clicked", async () => {
    (global as Record<string, unknown>).fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (options?.method === "DELETE") {
        return {
          ok: true,
        } as Response;
      }
      if (urlString.includes("/content")) {
        return {
          ok: true,
          json: async () => ({ data: { content: mockContent, contentPath: mockResource.contentPath } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ data: mockResource }),
      } as Response;
    };

    render(<RawResourceDetail resourceId="raw-1" />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Delete")).toBeTruthy();
    });

    const deleteButton = screen.getAllByRole("button").find(btn => btn.className.includes("text-red"));
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(screen.getByText("Delete Raw Resource")).toBeTruthy();
    });
  });
});
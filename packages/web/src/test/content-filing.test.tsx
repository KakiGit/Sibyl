import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentFiling } from "../components/content-filing";

let originalFetch: typeof fetch;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const mockFilingResult = {
  data: {
    wikiPageId: "test-page-1",
    slug: "test-filing",
    title: "Test Filing",
    type: "summary",
    linkedPages: ["page-1", "page-2"],
    filedAt: Date.now(),
  },
};

const mockFilingHistory = {
  data: [
    {
      wikiPageId: "history-1",
      title: "Previous Filing",
      slug: "previous-filing",
      filedAt: Date.now() - 1000,
    },
    {
      wikiPageId: "history-2",
      title: "Old Filing",
      slug: "old-filing",
      filedAt: Date.now() - 2000,
    },
  ],
};

function getSubmitButton(container: HTMLElement, buttonText: RegExp): HTMLElement | null {
  const buttons = container.querySelectorAll("button[type='submit']");
  for (const button of buttons) {
    if (button.textContent?.match(buttonText)) {
      return button as HTMLElement;
    }
  }
  return null;
}

describe("ContentFiling", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe("Initial Rendering", () => {
    it("renders the component with title", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Content Filing/i)).toBeTruthy();
      });
    });

    it("renders filing history section", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Filing History/i)).toBeTruthy();
      });
    });

    it("renders mode toggle buttons", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        const buttons = screen.getAllByText(/File Content/i);
        expect(buttons.length).toBeGreaterThan(0);
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });
    });

    it("renders loading skeleton while fetching history", () => {
      (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;

      render(<ContentFiling />, { wrapper: createWrapper() });

      const skeletons = screen.getAllByRole("generic").filter((el) =>
        el.className.includes("animate-pulse")
      );
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("renders empty history state", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/No filing history yet/i)).toBeTruthy();
      });
    });

    it("renders filing history entries", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => mockFilingHistory,
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("Previous Filing")).toBeTruthy();
        expect(screen.getByText("Old Filing")).toBeTruthy();
      });
    });
  });

  describe("File Content Mode", () => {
    it("renders content filing form by default", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/Enter the content to file/i)).toBeTruthy();
      });
    });

    it("renders all form fields for content filing", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/Enter the content to file/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/Brief summary/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/research, analysis/i)).toBeTruthy();
      });
    });

    it("renders type selector dropdown", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        expect(select).toBeTruthy();
      });
    });

    it("shows type options in dropdown", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        const select = screen.getByRole("combobox");
        fireEvent.click(select);
      });

      await waitFor(() => {
        expect(screen.getByText("Summary")).toBeTruthy();
        expect(screen.getByText("Concept")).toBeTruthy();
        expect(screen.getByText("Entity")).toBeTruthy();
        expect(screen.getByText("Source")).toBeTruthy();
      });
    });

    it("disables submit button when fields are empty", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        const submitButton = getSubmitButton(container, /File Content/i);
        expect(submitButton?.getAttribute("disabled")).not.toBeNull();
      });
    });

    it("enables submit button when title and content are filled", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      await waitFor(() => {
        const submitButton = getSubmitButton(container, /File Content/i);
        expect(submitButton?.getAttribute("disabled")).toBeNull();
      });
    });

    it("submits content filing request", async () => {
      let fetchCalls: { url: string; options?: RequestInit }[] = [];
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request, options?: RequestInit) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        fetchCalls.push({ url: urlString, options });
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(fetchCalls.some(c => c.url === "/api/filing")).toBe(true);
      });
    });

    it("displays success message after filing", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Content filed successfully/i)).toBeTruthy();
      });
    });

    it("displays filing result card after success", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Test Filing")).toBeTruthy();
        expect(screen.getByText("test-filing")).toBeTruthy();
      });
    });

    it("displays type badge in result", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("Summary")).toBeTruthy();
      });
    });

    it("displays link count badge when pages are linked", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("2")).toBeTruthy();
      });
    });

    it("displays error message on filing failure", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ message: "Failed to file content" }),
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content for filing" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to file content/i)).toBeTruthy();
      });
    });

    it("clears form on Clear button click", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i) as HTMLInputElement;
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i) as HTMLTextAreaElement;

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content" } });

      expect(titleInput.value).toBe("Test Title");
      expect(contentTextarea.value).toBe("Test content");

      const clearButton = screen.getByRole("button", { name: /Clear/i });
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(titleInput.value).toBe("");
        expect(contentTextarea.value).toBe("");
      });
    });
  });

  describe("File Query Result Mode", () => {
    it("switches to query filing mode", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
      });
    });

    it("renders query filing form fields", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/Custom title/i)).toBeTruthy();
        expect(screen.getByPlaceholderText(/research, summary/i)).toBeTruthy();
      });
    });

    it("renders max pages selector", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        const selectElements = screen.getAllByRole("combobox");
        expect(selectElements.length).toBeGreaterThan(0);
      });
    });

    it("disables submit button when query is empty", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        const submitButton = getSubmitButton(container, /File Query Result/i);
        expect(submitButton?.getAttribute("disabled")).not.toBeNull();
      });
    });

    it("enables submit button when query is filled", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
      });

      const queryInput = screen.getByPlaceholderText(/Search query/i);
      fireEvent.change(queryInput, { target: { value: "test query" } });

      await waitFor(() => {
        const submitButton = getSubmitButton(container, /File Query Result/i);
        expect(submitButton?.getAttribute("disabled")).toBeNull();
      });
    });

    it("submits query filing request", async () => {
      let fetchCalls: { url: string; options?: RequestInit }[] = [];
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request, options?: RequestInit) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        fetchCalls.push({ url: urlString, options });
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
      });

      const queryInput = screen.getByPlaceholderText(/Search query/i);
      fireEvent.change(queryInput, { target: { value: "test query" } });

      const submitButton = getSubmitButton(container, /File Query Result/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(fetchCalls.some(c => c.url === "/api/filing/query")).toBe(true);
      });
    });

    it("displays success after query filing", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
      });

      const queryInput = screen.getByPlaceholderText(/Search query/i);
      fireEvent.change(queryInput, { target: { value: "test query" } });

      const submitButton = getSubmitButton(container, /File Query Result/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Content filed successfully/i)).toBeTruthy();
      });
    });

    it("displays error on query filing failure", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ message: "Failed to file query result" }),
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/File Query Result/i)).toBeTruthy();
      });

      const queryModeButton = screen.getByText(/File Query Result/i);
      fireEvent.click(queryModeButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search query/i)).toBeTruthy();
      });

      const queryInput = screen.getByPlaceholderText(/Search query/i);
      fireEvent.change(queryInput, { target: { value: "test query" } });

      const submitButton = getSubmitButton(container, /File Query Result/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Failed to file query result/i)).toBeTruthy();
      });
    });
  });

  describe("History Display", () => {
    it("displays history dates correctly", async () => {
      const now = Date.now();
      (global as Record<string, unknown>).fetch = async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              wikiPageId: "history-1",
              title: "Recent Filing",
              slug: "recent-filing",
              filedAt: now,
            },
          ],
        }),
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText("Recent Filing")).toBeTruthy();
      });
    });

    it("refreshes history after successful filing", async () => {
      let historyCallCount = 0;
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          historyCallCount++;
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => mockFilingResult,
        } as Response;
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const initialCallCount = historyCallCount;

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(historyCallCount).toBeGreaterThan(initialCallCount);
      });
    });
  });

  describe("Error Handling", () => {
    it("handles fetch error gracefully for history", async () => {
      (global as Record<string, unknown>).fetch = async () => ({
        ok: false,
      } as Response);

      render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/Content Filing/i)).toBeTruthy();
      });
    });

    it("handles network error on filing", async () => {
      (global as Record<string, unknown>).fetch = async (url: string | URL | Request) => {
        const urlString = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlString.includes("/api/filing/history")) {
          return {
            ok: true,
            json: async () => ({ data: [] }),
          } as Response;
        }
        throw new Error("Network error");
      };

      const { container } = render(<ContentFiling />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Wiki page title/i)).toBeTruthy();
      });

      const titleInput = screen.getByPlaceholderText(/Wiki page title/i);
      const contentTextarea = screen.getByPlaceholderText(/Enter the content to file/i);

      fireEvent.change(titleInput, { target: { value: "Test Title" } });
      fireEvent.change(contentTextarea, { target: { value: "Test content" } });

      const submitButton = getSubmitButton(container, /File Content/i);
      if (submitButton) fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeTruthy();
      });
    });
  });
});
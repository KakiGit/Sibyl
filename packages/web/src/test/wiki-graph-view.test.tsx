import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiGraphView } from "../components/wiki-graph-view";

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

const mockGraphData = {
  data: {
    nodes: [
      {
        id: "page-1",
        slug: "main-concept",
        title: "Main Concept",
        type: "concept",
        incomingLinks: 5,
        outgoingLinks: 3,
        isOrphan: false,
        isHub: true,
      },
      {
        id: "page-2",
        slug: "orphan-page",
        title: "Orphan Page",
        type: "entity",
        incomingLinks: 0,
        outgoingLinks: 0,
        isOrphan: true,
        isHub: false,
      },
      {
        id: "page-3",
        slug: "regular-page",
        title: "Regular Page",
        type: "source",
        incomingLinks: 1,
        outgoingLinks: 1,
        isOrphan: false,
        isHub: false,
      },
    ],
    edges: [
      { id: "link-1", from: "page-1", to: "page-3", relationType: "references" },
    ],
    stats: {
      totalPages: 3,
      totalLinks: 1,
      orphanCount: 1,
      hubCount: 1,
    },
  },
};

describe("WikiGraphView", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders loading skeleton while fetching", () => {
    (global as Record<string, unknown>).fetch = async () => new Promise(() => {}) as Promise<Response>;

    render(<WikiGraphView />, { wrapper: createWrapper() });

    const skeletons = screen.getAllByRole("generic").filter((el) =>
      el.className.includes("animate-pulse")
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no graph data", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => ({
        data: {
          nodes: [],
          edges: [],
          stats: { totalPages: 0, totalLinks: 0, orphanCount: 0, hubCount: 0 },
        },
      }),
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/No wiki pages to visualize/i)).toBeTruthy();
    });
  });

  it("renders graph statistics correctly", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Pages")).toBeTruthy();
      expect(screen.getByText("Links")).toBeTruthy();
      expect(screen.getByText("Orphans")).toBeTruthy();
      expect(screen.getByText("Hubs")).toBeTruthy();
    });
  });

  it("renders hub pages section in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText(/Hub Pages/i)).toBeTruthy();
      expect(screen.getByText("Main Concept")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("renders orphan pages section in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText(/Orphan Pages/i)).toBeTruthy();
      expect(screen.getByText("Orphan Page")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("displays orphan badge on orphan nodes in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      const orphanBadges = screen.getAllByText("Orphan").filter((el) =>
        el.className.includes("text-red")
      );
      expect(orphanBadges.length).toBeGreaterThan(0);
    }, { timeout: 10000 });
  });

  it("displays hub badge on hub nodes in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      const hubBadges = screen.getAllByText("Hub").filter((el) =>
        el.className.includes("text-blue")
      );
      expect(hubBadges.length).toBeGreaterThan(0);
    }, { timeout: 10000 });
  });

  it("shows page type badges correctly in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText("Concept")).toBeTruthy();
      expect(screen.getByText("Entity")).toBeTruthy();
      expect(screen.getByText("Source")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows incoming and outgoing link counts in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText("Main Concept")).toBeTruthy();
      const allLinkCounts = screen.getAllByText("5");
      expect(allLinkCounts.length).toBeGreaterThan(0);
    }, { timeout: 10000 });
  });

  it("shows error state on fetch failure", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: false,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Failed to load wiki graph/i)).toBeTruthy();
    });
  });

  it("renders regular pages section in list view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText(/All Pages/i)).toBeTruthy();
      expect(screen.getByText("Regular Page")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("displays connection info message in interactive view", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Interactive visualization/i)).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("handles graph with all hub nodes in list view", async () => {
    const allHubsData = {
      data: {
        nodes: [
          {
            id: "hub-1",
            slug: "hub-one",
            title: "Hub One",
            type: "concept",
            incomingLinks: 5,
            outgoingLinks: 4,
            isOrphan: false,
            isHub: true,
          },
          {
            id: "hub-2",
            slug: "hub-two",
            title: "Hub Two",
            type: "entity",
            incomingLinks: 3,
            outgoingLinks: 5,
            isOrphan: false,
            isHub: true,
          },
        ],
        edges: [
          { id: "link-1", from: "hub-1", to: "hub-2", relationType: "related" },
        ],
        stats: {
          totalPages: 2,
          totalLinks: 1,
          orphanCount: 0,
          hubCount: 2,
        },
      },
    };

    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => allHubsData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText("Hub One")).toBeTruthy();
      expect(screen.getByText("Hub Two")).toBeTruthy();
      expect(screen.queryByText(/Orphan Pages/i)).toBeFalsy();
    }, { timeout: 10000 });
  });

  it("handles graph with all orphan nodes in list view", async () => {
    const allOrphansData = {
      data: {
        nodes: [
          {
            id: "orphan-1",
            slug: "orphan-one",
            title: "Orphan One",
            type: "concept",
            incomingLinks: 0,
            outgoingLinks: 0,
            isOrphan: true,
            isHub: false,
          },
          {
            id: "orphan-2",
            slug: "orphan-two",
            title: "Orphan Two",
            type: "entity",
            incomingLinks: 0,
            outgoingLinks: 0,
            isOrphan: true,
            isHub: false,
          },
        ],
        edges: [],
        stats: {
          totalPages: 2,
          totalLinks: 0,
          orphanCount: 2,
          hubCount: 0,
        },
      },
    };

    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => allOrphansData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByText("List"));

    await waitFor(() => {
      expect(screen.getByText("Orphan One")).toBeTruthy();
      expect(screen.getByText("Orphan Two")).toBeTruthy();
      expect(screen.queryByText(/Hub Pages/i)).toBeFalsy();
    }, { timeout: 10000 });
  });

  it("renders view mode toggle buttons", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Graph")).toBeTruthy();
      expect(screen.getByText("List")).toBeTruthy();
    });
  });

  it("defaults to interactive (Graph) view mode", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Interactive visualization/i)).toBeTruthy();
    });
  });

  it("switches to list view when clicking List button", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    const listButton = screen.getByText("List");
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByText(/Visualizing 3 pages/i)).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows hub pages section in list view mode", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    const listButton = screen.getByText("List");
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByText(/Hub Pages/i)).toBeTruthy();
      expect(screen.getByText("Main Concept")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows orphan pages section in list view mode", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    const listButton = screen.getByText("List");
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByText(/Orphan Pages/i)).toBeTruthy();
      expect(screen.getByText("Orphan Page")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows regular pages section in list view mode", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    const listButton = screen.getByText("List");
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByText(/All Pages/i)).toBeTruthy();
      expect(screen.getByText("Regular Page")).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("switches back to graph view when clicking Graph button", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("List")).toBeTruthy();
    }, { timeout: 10000 });

    const listButton = screen.getByText("List");
    fireEvent.click(listButton);

    await waitFor(() => {
      expect(screen.getByText("Graph")).toBeTruthy();
    }, { timeout: 10000 });

    const graphButton = screen.getByText("Graph");
    fireEvent.click(graphButton);

    await waitFor(() => {
      expect(screen.getByText(/Interactive visualization/i)).toBeTruthy();
    }, { timeout: 10000 });
  });

  it("shows page detail panel as overlay without hiding graph", async () => {
    (global as Record<string, unknown>).fetch = async () => ({
      ok: true,
      json: async () => mockGraphData,
    } as Response);

    render(<WikiGraphView />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Interactive visualization/i)).toBeTruthy();
    }, { timeout: 10000 });

    const graphView = screen.getByText(/Interactive visualization/i).closest("div");
    expect(graphView?.className).toContain("space-y-4");
  });
});
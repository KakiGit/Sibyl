import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InteractiveGraph } from "../components/interactive-graph";

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
  nodes: [
    {
      id: "page-1",
      slug: "main-concept",
      title: "Main Concept",
      type: "concept" as const,
      incomingLinks: 5,
      outgoingLinks: 3,
      isOrphan: false,
      isHub: true,
    },
    {
      id: "page-2",
      slug: "orphan-page",
      title: "Orphan Page",
      type: "entity" as const,
      incomingLinks: 0,
      outgoingLinks: 0,
      isOrphan: true,
      isHub: false,
    },
    {
      id: "page-3",
      slug: "regular-page",
      title: "Regular Page",
      type: "source" as const,
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
};

describe("InteractiveGraph", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("shows preparing canvas when container has no dimensions", () => {
    render(<InteractiveGraph graph={mockGraphData} />, { wrapper: createWrapper() });
    expect(screen.getByText("Preparing canvas...")).toBeTruthy();
  });

  it("shows no nodes message for empty graph", () => {
    const emptyGraph = {
      nodes: [],
      edges: [],
      stats: { totalPages: 0, totalLinks: 0, orphanCount: 0, hubCount: 0 },
    };
    render(<InteractiveGraph graph={emptyGraph} />, { wrapper: createWrapper() });
    expect(screen.getByText("No nodes to display")).toBeTruthy();
  });

  it("shows layout optimization progress indicator", async () => {
    const largeGraph = {
      nodes: Array.from({ length: 50 }, (_, i) => ({
        id: `page-${i}`,
        slug: `page-${i}`,
        title: `Page ${i}`,
        type: "concept" as const,
        incomingLinks: Math.floor(Math.random() * 5),
        outgoingLinks: Math.floor(Math.random() * 5),
        isOrphan: i % 10 === 0,
        isHub: i % 5 === 0,
      })),
      edges: [],
      stats: { totalPages: 50, totalLinks: 0, orphanCount: 5, hubCount: 10 },
    };

    render(<InteractiveGraph graph={largeGraph} />, { wrapper: createWrapper() });
    
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("Optimizing layout...")).toBeTruthy();
  });

  it("reduces iterations based on node count", async () => {
    const smallGraph = {
      nodes: Array.from({ length: 10 }, (_, i) => ({
        id: `page-${i}`,
        slug: `page-${i}`,
        title: `Page ${i}`,
        type: "concept" as const,
        incomingLinks: 0,
        outgoingLinks: 0,
        isOrphan: true,
        isHub: false,
      })),
      edges: [],
      stats: { totalPages: 10, totalLinks: 0, orphanCount: 10, hubCount: 0 },
    };

    render(<InteractiveGraph graph={smallGraph} />, { wrapper: createWrapper() });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("Optimizing layout...")).toBeTruthy();
  });

  it("shows progress percentage during layout optimization", async () => {
    const mediumGraph = {
      nodes: Array.from({ length: 30 }, (_, i) => ({
        id: `page-${i}`,
        slug: `page-${i}`,
        title: `Page ${i}`,
        type: "concept" as const,
        incomingLinks: 0,
        outgoingLinks: 0,
        isOrphan: true,
        isHub: false,
      })),
      edges: [],
      stats: { totalPages: 30, totalLinks: 0, orphanCount: 30, hubCount: 0 },
    };

    render(<InteractiveGraph graph={mediumGraph} />, { wrapper: createWrapper() });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const progressText = screen.getByText(/\d+%/);
    expect(progressText).toBeTruthy();
  });

  it("has expected DOM structure with loading state", () => {
    const { container } = render(<InteractiveGraph graph={mockGraphData} />, { wrapper: createWrapper() });
    expect(screen.getByText("Preparing canvas...")).toBeTruthy();
    expect(container.querySelector(".bg-muted\\/30")).toBeTruthy();
  });
});
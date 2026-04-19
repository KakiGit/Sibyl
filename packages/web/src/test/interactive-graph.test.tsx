import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders initializing state when container has no dimensions", () => {
    render(<InteractiveGraph graph={mockGraphData} />, { wrapper: createWrapper() });
    expect(screen.getByText("Initializing graph...")).toBeTruthy();
  });

  it("handles empty graph", () => {
    const emptyGraph = {
      nodes: [],
      edges: [],
      stats: { totalPages: 0, totalLinks: 0, orphanCount: 0, hubCount: 0 },
    };

    render(<InteractiveGraph graph={emptyGraph} />, { wrapper: createWrapper() });
    expect(screen.getByText("Initializing graph...")).toBeTruthy();
  });

  it("has expected DOM structure with initializing state", () => {
    const { container } = render(<InteractiveGraph graph={mockGraphData} />, { wrapper: createWrapper() });
    
    expect(screen.getByText("Initializing graph...")).toBeTruthy();
    expect(container.querySelector(".bg-muted\\/30")).toBeTruthy();
  });
});
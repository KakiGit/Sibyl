import "@happy-dom/global-registrator";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodePreviewModal } from "../components/node-preview-modal";

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

const mockNode = {
  id: "test-page-1",
  slug: "test-page",
  title: "Test Page Title",
  type: "concept" as const,
  incomingLinks: 3,
  outgoingLinks: 2,
  isOrphan: false,
  isHub: true,
};

const mockPageContent = {
  data: {
    title: "Test Page Title",
    type: "concept",
    slug: "test-page",
    summary: "This is a test summary",
    content: "This is the main content of the test page.",
    tags: ["test", "concept"],
  },
};

describe("NodePreviewModal", () => {
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders nothing when node is null", () => {
    const { container } = render(
      <NodePreviewModal node={null} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with node title when node is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Test Page Title")).toBeTruthy();
    expect(screen.getByText("Concept")).toBeTruthy();
    expect(screen.getByText("Hub")).toBeTruthy();
  });

  it("renders with proper dialog structure without duplicate overlays", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    const { container } = render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    const dialogRole = container.querySelector('[role="dialog"]');
    expect(dialogRole).toBeTruthy();

    const overlays = container.querySelectorAll('.fixed.inset-0.bg-black\\/50');
    expect(overlays.length).toBe(1);
  });

  it("shows loading state while fetching content", async () => {
    global.fetch = vi.fn().mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({ ok: true, json: async () => mockPageContent }), 100)
      )
    );

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("Loading content...")).toBeTruthy();
  });

  it("displays content when fetch succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("This is a test summary")).toBeTruthy();
    });

    expect(screen.getByText("test")).toBeTruthy();
    expect(screen.getByText("concept")).toBeTruthy();
  });

  it("displays link counts correctly", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("3 incoming")).toBeTruthy();
      expect(screen.getByText("2 outgoing")).toBeTruthy();
    });
  });

  it("has close button accessible", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    const closeButton = screen.getByLabelText("Close preview");
    expect(closeButton).toBeTruthy();
  });

  it("has View Full Page button", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPageContent,
    });

    render(
      <NodePreviewModal node={mockNode} onClose={() => {}} onViewFullPage={() => {}} />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("View Full Page")).toBeTruthy();
  });
});
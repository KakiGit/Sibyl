import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "./use-websocket";

const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => mockQueryClient,
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor() {
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.({ type: "error" } as Event);
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

describe("useWebSocket", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    mockQueryClient.invalidateQueries.mockClear();
    vi.useFakeTimers();
  });

  it("creates WebSocket connection on mount", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("subscribes to events after connection", async () => {
    renderHook(() =>
      useWebSocket({
        subscriptions: ["wiki_page_created", "wiki_page_updated"],
      })
    );

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    expect(ws.sentMessages.length).toBe(1);

    const subscribeMsg = JSON.parse(ws.sentMessages[0]);
    expect(subscribeMsg.type).toBe("subscribe");
    expect(subscribeMsg.events).toEqual(["wiki_page_created", "wiki_page_updated"]);
  });

  it("stores clientId from connected message", async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "connected",
        clientId: "test-client-id",
      });
    });

    expect(result.current.clientId).toBe("test-client-id");
  });

  it("calls onConnect callback when connected", async () => {
    const onConnect = vi.fn();
    renderHook(() =>
      useWebSocket({
        onConnect,
      })
    );

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "connected",
        clientId: "test-client-id",
      });
    });

    expect(onConnect).toHaveBeenCalledWith("test-client-id");
  });

  it("calls onDisconnect callback when closed", async () => {
    const onDisconnect = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket({
        onDisconnect,
      })
    );

    await act(async () => {
      vi.runAllTimers();
    });

    act(() => {
      result.current.disconnect();
    });

    expect(onDisconnect).toHaveBeenCalled();
  });

  it("invalidates queries on wiki_page_created event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "wiki_page_created",
        payload: { id: "test", title: "Test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["stats"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["wiki-pages"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["wiki-graph"],
    });
  });

  it("invalidates queries on wiki_page_updated event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "wiki_page_updated",
        payload: { id: "test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["stats"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["wiki-pages"],
    });
  });

  it("invalidates queries on wiki_page_deleted event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "wiki_page_deleted",
        payload: { id: "test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["stats"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["wiki-pages"],
    });
  });

  it("invalidates queries on raw_resource_created event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "raw_resource_created",
        payload: { id: "test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["raw-resources"],
    });
  });

  it("invalidates queries on processing_log_created event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "processing_log_created",
        payload: { id: "test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["processing-log"],
    });
  });

  it("invalidates queries on ingest_completed event", async () => {
    renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.simulateMessage({
        type: "ingest_completed",
        payload: { rawResourceId: "test" },
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["stats"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["wiki-pages"],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["processing-log"],
    });
  });

  it("send subscribe message via subscribe function", async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    ws.sentMessages = [];

    act(() => {
      result.current.subscribe(["wiki_page_deleted"]);
    });

    expect(ws.sentMessages.length).toBe(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.type).toBe("subscribe");
    expect(msg.events).toEqual(["wiki_page_deleted"]);
  });

  it("send unsubscribe message via unsubscribe function", async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    ws.sentMessages = [];

    act(() => {
      result.current.unsubscribe(["wiki_page_created"]);
    });

    expect(ws.sentMessages.length).toBe(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.type).toBe("unsubscribe");
  });

  it("send ping message via ping function", async () => {
    const { result } = renderHook(() => useWebSocket());

    await act(async () => {
      vi.runAllTimers();
    });

    const ws = MockWebSocket.instances[0];
    ws.sentMessages = [];

    act(() => {
      result.current.ping();
    });

    expect(ws.sentMessages.length).toBe(1);
    const msg = JSON.parse(ws.sentMessages[0]);
    expect(msg.type).toBe("ping");
  });
});
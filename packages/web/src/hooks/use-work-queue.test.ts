import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWorkQueue } from "./use-work-queue";

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
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.({ type: "error" } as Event);
  }
}

const mockFetch = vi.fn();

const originalWebSocket = global.WebSocket;
const originalFetch = global.fetch;

beforeAll(() => {
  global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  global.fetch = mockFetch;
});

afterAll(() => {
  global.WebSocket = originalWebSocket;
  global.fetch = originalFetch;
});

describe("useWorkQueue", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates WebSocket connection on mount", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    renderHook(() => useWorkQueue());

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
  });

  it("subscribes to work_queue_updated events after connection", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    renderHook(() => useWorkQueue());

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateOpen();
    });

    expect(ws.sentMessages.length).toBe(1);
    const subscribeMsg = JSON.parse(ws.sentMessages[0]);
    expect(subscribeMsg.type).toBe("subscribe");
    expect(subscribeMsg.events).toEqual(["work_queue_updated"]);
  });

  it("fetches initial status on connect", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    renderHook(() => useWorkQueue());

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateOpen();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/work-queue/status");
  });

  it("updates status on work_queue_updated message", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    const { result } = renderHook(() => useWorkQueue());

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.simulateMessage({
        type: "work_queue_updated",
        payload: {
          active: true,
          queueLength: 3,
          currentItem: {
            id: "test-1",
            operation: "llm_call",
            description: "Test task",
            startedAt: Date.now(),
          },
        },
      });
    });

    expect(result.current.status.active).toBe(true);
    expect(result.current.status.queueLength).toBe(3);
    expect(result.current.status.currentItem?.operation).toBe("llm_call");
  });

  it("sets connected to true on open", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    const { result } = renderHook(() => useWorkQueue());

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.connected).toBe(true);
  });

  it("sets connected to false on close", async () => {
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ active: false, queueLength: 0, currentItem: null }),
    });
    
    const { result } = renderHook(() => useWorkQueue());

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.connected).toBe(true);

    act(() => {
      ws.close();
    });

    expect(result.current.connected).toBe(false);
  });
});
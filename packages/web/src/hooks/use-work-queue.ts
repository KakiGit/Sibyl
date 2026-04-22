import { useState, useEffect, useRef, useCallback } from "react";

export type WorkQueueStatus = {
  active: boolean;
  queueLength: number;
  currentItem: {
    id: string;
    operation: string;
    description: string;
    startedAt: number;
  } | null;
};

export function useWorkQueue(wsUrl?: string) {
  const [status, setStatus] = useState<WorkQueueStatus>({
    active: false,
    queueLength: 0,
    currentItem: null,
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const getWebSocketUrl = useCallback(() => {
    if (wsUrl) return wsUrl;
    if (import.meta.env.DEV) {
      return "ws://localhost:3000/ws";
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }, [wsUrl]);

  useEffect(() => {
    const url = getWebSocketUrl();
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({
        type: "subscribe",
        events: ["work_queue_updated"],
      }));
      fetch("/api/work-queue/status")
        .then((res) => res.json())
        .then((data) => setStatus(data))
        .catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "work_queue_updated" && message.payload) {
          setStatus(message.payload as WorkQueueStatus);
        }
      } catch {
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [getWebSocketUrl]);

  return { status, connected };
}
import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type WebSocketEventType =
  | "wiki_page_created"
  | "wiki_page_updated"
  | "wiki_page_deleted"
  | "raw_resource_created"
  | "raw_resource_updated"
  | "raw_resource_deleted"
  | "processing_log_created"
  | "lint_completed"
  | "ingest_completed"
  | "query_completed"
  | "work_queue_updated";

export type WebSocketMessage = {
  type: "connected" | "subscribed" | "unsubscribed" | "pong" | "error" | WebSocketEventType;
  clientId?: string;
  events?: string[];
  timestamp?: number;
  message?: string;
  payload?: unknown;
};

export type UseWebSocketOptions = {
  url?: string;
  subscriptions?: WebSocketEventType[];
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: (clientId: string) => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
};

export type WebSocketStatus = "connecting" | "connected" | "disconnected" | "error";

const DEFAULT_SUBSCRIPTIONS: WebSocketEventType[] = [
  "wiki_page_created",
  "wiki_page_updated",
  "wiki_page_deleted",
  "raw_resource_created",
  "processing_log_created",
  "ingest_completed",
  "lint_completed",
];

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url,
    subscriptions = DEFAULT_SUBSCRIPTIONS,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const [clientId, setClientId] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);

  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  const wsUrl = url || getWebSocketUrl();

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      setStatus("connecting");

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setStatus("connected");
          reconnectAttemptsRef.current = 0;

          if (subscriptions.length > 0) {
            ws.send(JSON.stringify({
              type: "subscribe",
              events: subscriptions,
            }));
          }
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const message: WebSocketMessage = JSON.parse(event.data);

            if (message.type === "connected" && message.clientId) {
              setClientId(message.clientId);
              onConnectRef.current?.(message.clientId);
            }

            if (message.type === "error" && message.message) {
              console.error("WebSocket error:", message.message);
            }

            onMessageRef.current?.(message);

            invalidateQueries(message);
          } catch {
            console.error("Failed to parse WebSocket message");
          }
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setStatus("disconnected");
          wsRef.current = null;
          onDisconnectRef.current?.();

          if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectDelay);
          }
        };

        ws.onerror = (error) => {
          if (!mountedRef.current) return;
          setStatus("error");
          onErrorRef.current?.(error);
        };

        wsRef.current = ws;
      } catch (error) {
        setStatus("error");
        console.error("Failed to create WebSocket connection:", error);
      }
    };

    const disconnect = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectAttemptsRef.current = maxReconnectAttempts;
      wsRef.current?.close();
      wsRef.current = null;
      setStatus("disconnected");
    };

    connect();

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [wsUrl, subscriptions, autoReconnect, reconnectDelay, maxReconnectAttempts]);

  const subscribe = useCallback((events: WebSocketEventType[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "subscribe",
        events,
      }));
    }
  }, []);

  const unsubscribe = useCallback((events: WebSocketEventType[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "unsubscribe",
        events,
      }));
    }
  }, []);

  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  const invalidateQueries = (message: WebSocketMessage) => {
    switch (message.type) {
      case "wiki_page_created":
      case "wiki_page_updated":
      case "wiki_page_deleted":
        queryClient.invalidateQueries({ queryKey: ["stats"] });
        queryClient.invalidateQueries({ queryKey: ["wiki-pages"] });
        queryClient.invalidateQueries({ queryKey: ["wiki-graph"] });
        break;
      case "raw_resource_created":
      case "raw_resource_updated":
      case "raw_resource_deleted":
        queryClient.invalidateQueries({ queryKey: ["raw-resources"] });
        break;
      case "processing_log_created":
        queryClient.invalidateQueries({ queryKey: ["processing-log"] });
        break;
      case "ingest_completed":
      case "lint_completed":
        queryClient.invalidateQueries({ queryKey: ["stats"] });
        queryClient.invalidateQueries({ queryKey: ["wiki-pages"] });
        queryClient.invalidateQueries({ queryKey: ["processing-log"] });
        break;
    }
  };

  return {
    status,
    clientId,
    subscribe,
    unsubscribe,
    ping,
  };
}

function getWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return "ws://localhost:3000/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}
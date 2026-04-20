import { useEffect, useRef, useCallback } from "react";
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
  | "query_completed";

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

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url,
    subscriptions = ["wiki_page_created", "wiki_page_updated", "wiki_page_deleted", "raw_resource_created", "processing_log_created", "ingest_completed", "lint_completed"],
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
  const statusRef = useRef<WebSocketStatus>("disconnected");
  const clientIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wsUrl = url || getWebSocketUrl();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    statusRef.current = "connecting";

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        statusRef.current = "connected";
        reconnectAttemptsRef.current = 0;

        if (subscriptions.length > 0) {
          ws.send(JSON.stringify({
            type: "subscribe",
            events: subscriptions,
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === "connected" && message.clientId) {
            clientIdRef.current = message.clientId;
            onConnect?.(message.clientId);
          }

          if (message.type === "error" && message.message) {
            console.error("WebSocket error:", message.message);
          }

          onMessage?.(message);

          invalidateQueries(message);
        } catch {
          console.error("Failed to parse WebSocket message");
        }
      };

      ws.onclose = () => {
        statusRef.current = "disconnected";
        wsRef.current = null;
        onDisconnect?.();

        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        }
      };

      ws.onerror = (error) => {
        statusRef.current = "error";
        onError?.(error);
      };

      wsRef.current = ws;
    } catch (error) {
      statusRef.current = "error";
      console.error("Failed to create WebSocket connection:", error);
    }
  }, [wsUrl, subscriptions, onMessage, onConnect, onDisconnect, onError, autoReconnect, reconnectDelay, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptsRef.current = maxReconnectAttempts;
    wsRef.current?.close();
    wsRef.current = null;
    statusRef.current = "disconnected";
  }, [maxReconnectAttempts]);

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

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

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
    status: statusRef.current,
    clientId: clientIdRef.current,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    ping,
  };
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}
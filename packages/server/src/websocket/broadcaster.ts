import { logger } from "@sibyl/shared";

export type WebSocketEvent = {
  type: "wiki_page_created" | "wiki_page_updated" | "wiki_page_deleted" | 
        "raw_resource_created" | "raw_resource_updated" | "raw_resource_deleted" |
        "processing_log_created" | "lint_completed" | "ingest_completed" | "query_completed";
  payload: unknown;
  timestamp: number;
};

export type WebSocketClient = {
  id: string;
  send: (message: string) => void;
  subscriptions?: Set<string>;
};

class WebSocketBroadcaster {
  private clients: Map<string, WebSocketClient> = new Map();

  addClient(client: WebSocketClient): void {
    this.clients.set(client.id, client);
    logger.debug("WebSocket client connected", { clientId: client.id, total: this.clients.size });
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.debug("WebSocket client disconnected", { clientId: clientId, total: this.clients.size });
  }

  broadcast(event: WebSocketEvent, excludeClientId?: string): void {
    const message = JSON.stringify(event);
    
    for (const [id, client] of this.clients) {
      if (id === excludeClientId) continue;
      
      if (client.subscriptions && !client.subscriptions.has(event.type)) continue;
      
      try {
        client.send(message);
      } catch (error) {
        logger.warn("Failed to send WebSocket message", { clientId: id, error });
        this.removeClient(id);
      }
    }
    
    logger.debug("Broadcasted WebSocket event", { eventType: event.type, clientsReached: this.clients.size });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

export const websocketBroadcaster = new WebSocketBroadcaster();

export function broadcastWikiPageCreated(page: { id: string; slug: string; title: string; type: string }): void {
  websocketBroadcaster.broadcast({
    type: "wiki_page_created",
    payload: page,
    timestamp: Date.now(),
  });
}

export function broadcastWikiPageUpdated(page: { id: string; slug: string; title: string; type: string }): void {
  websocketBroadcaster.broadcast({
    type: "wiki_page_updated",
    payload: page,
    timestamp: Date.now(),
  });
}

export function broadcastWikiPageDeleted(pageId: string): void {
  websocketBroadcaster.broadcast({
    type: "wiki_page_deleted",
    payload: { id: pageId },
    timestamp: Date.now(),
  });
}

export function broadcastRawResourceCreated(resource: { id: string; type: string; filename: string }): void {
  websocketBroadcaster.broadcast({
    type: "raw_resource_created",
    payload: resource,
    timestamp: Date.now(),
  });
}

export function broadcastProcessingLogCreated(log: { id: string; operation: string }): void {
  websocketBroadcaster.broadcast({
    type: "processing_log_created",
    payload: log,
    timestamp: Date.now(),
  });
}

export function broadcastIngestCompleted(result: { rawResourceId: string; wikiPageId?: string; slug?: string }): void {
  websocketBroadcaster.broadcast({
    type: "ingest_completed",
    payload: result,
    timestamp: Date.now(),
  });
}

export function broadcastLintCompleted(report: { issues: number; timestamp: number }): void {
  websocketBroadcaster.broadcast({
    type: "lint_completed",
    payload: report,
    timestamp: Date.now(),
  });
}

export function broadcastQueryCompleted(result: { query: string; resultsCount: number }): void {
  websocketBroadcaster.broadcast({
    type: "query_completed",
    payload: result,
    timestamp: Date.now(),
  });
}
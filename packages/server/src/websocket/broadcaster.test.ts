import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import {
  websocketBroadcaster,
  broadcastWikiPageCreated,
  broadcastWikiPageUpdated,
  broadcastWikiPageDeleted,
  broadcastRawResourceCreated,
  broadcastProcessingLogCreated,
} from "./index.js";

describe("WebSocket Broadcaster", () => {
  beforeEach(() => {
    const clients = websocketBroadcaster.getConnectedClients();
    clients.forEach((id) => websocketBroadcaster.removeClient(id));
  });

  test("addClient registers a new client", () => {
    const messages: string[] = [];
    const client = {
      id: "test-client-1",
      send: (msg: string) => messages.push(msg),
    };

    websocketBroadcaster.addClient(client);

    expect(websocketBroadcaster.getClientCount()).toBe(1);
    expect(websocketBroadcaster.getConnectedClients()).toContain("test-client-1");
  });

  test("removeClient removes a client", () => {
    const client = {
      id: "test-client-2",
      send: () => {},
    };

    websocketBroadcaster.addClient(client);
    websocketBroadcaster.removeClient("test-client-2");

    expect(websocketBroadcaster.getClientCount()).toBe(0);
    expect(websocketBroadcaster.getConnectedClients()).not.toContain("test-client-2");
  });

  test("broadcast sends message to all clients", () => {
    const messages1: string[] = [];
    const messages2: string[] = [];

    websocketBroadcaster.addClient({
      id: "client-1",
      send: (msg) => messages1.push(msg),
    });
    websocketBroadcaster.addClient({
      id: "client-2",
      send: (msg) => messages2.push(msg),
    });

    websocketBroadcaster.broadcast({
      type: "wiki_page_created",
      payload: { id: "test", title: "Test Page" },
      timestamp: Date.now(),
    });

    expect(messages1.length).toBe(1);
    expect(messages2.length).toBe(1);

    const parsed1 = JSON.parse(messages1[0]);
    expect(parsed1.type).toBe("wiki_page_created");
    expect(parsed1.payload).toEqual({ id: "test", title: "Test Page" });
  });

  test("broadcast excludes specified client", () => {
    const messages1: string[] = [];
    const messages2: string[] = [];

    websocketBroadcaster.addClient({
      id: "client-1",
      send: (msg) => messages1.push(msg),
    });
    websocketBroadcaster.addClient({
      id: "client-2",
      send: (msg) => messages2.push(msg),
    });

    websocketBroadcaster.broadcast(
      {
        type: "wiki_page_created",
        payload: { id: "test" },
        timestamp: Date.now(),
      },
      "client-1"
    );

    expect(messages1.length).toBe(0);
    expect(messages2.length).toBe(1);
  });

  test("broadcast respects client subscriptions", () => {
    const messages: string[] = [];
    const subscriptions = new Set(["wiki_page_updated"]);

    websocketBroadcaster.addClient({
      id: "subscribed-client",
      send: (msg) => messages.push(msg),
      subscriptions,
    });

    websocketBroadcaster.broadcast({
      type: "wiki_page_created",
      payload: { id: "test" },
      timestamp: Date.now(),
    });

    expect(messages.length).toBe(0);

    websocketBroadcaster.broadcast({
      type: "wiki_page_updated",
      payload: { id: "test" },
      timestamp: Date.now(),
    });

    expect(messages.length).toBe(1);
  });

  test("broadcast removes failed clients", () => {
    const goodMessages: string[] = [];

    websocketBroadcaster.addClient({
      id: "bad-client",
      send: () => {
        throw new Error("Connection closed");
      },
    });
    websocketBroadcaster.addClient({
      id: "good-client",
      send: (msg) => goodMessages.push(msg),
    });

    websocketBroadcaster.broadcast({
      type: "wiki_page_created",
      payload: { id: "test" },
      timestamp: Date.now(),
    });

    expect(websocketBroadcaster.getClientCount()).toBe(1);
    expect(goodMessages.length).toBe(1);
  });
});

describe("Broadcast Functions", () => {
  beforeEach(() => {
    const clients = websocketBroadcaster.getConnectedClients();
    clients.forEach((id) => websocketBroadcaster.removeClient(id));
  });

  test("broadcastWikiPageCreated sends correct event", () => {
    const messages: string[] = [];
    websocketBroadcaster.addClient({
      id: "test-client",
      send: (msg) => messages.push(msg),
    });

    broadcastWikiPageCreated({
      id: "page-123",
      slug: "test-page",
      title: "Test Page",
      type: "concept",
    });

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe("wiki_page_created");
    expect(parsed.payload).toEqual({
      id: "page-123",
      slug: "test-page",
      title: "Test Page",
      type: "concept",
    });
  });

  test("broadcastWikiPageUpdated sends correct event", () => {
    const messages: string[] = [];
    websocketBroadcaster.addClient({
      id: "test-client",
      send: (msg) => messages.push(msg),
    });

    broadcastWikiPageUpdated({
      id: "page-123",
      slug: "test-page",
      title: "Updated Title",
      type: "concept",
    });

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe("wiki_page_updated");
  });

  test("broadcastWikiPageDeleted sends correct event", () => {
    const messages: string[] = [];
    websocketBroadcaster.addClient({
      id: "test-client",
      send: (msg) => messages.push(msg),
    });

    broadcastWikiPageDeleted("page-123");

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe("wiki_page_deleted");
    expect(parsed.payload).toEqual({ id: "page-123" });
  });

  test("broadcastRawResourceCreated sends correct event", () => {
    const messages: string[] = [];
    websocketBroadcaster.addClient({
      id: "test-client",
      send: (msg) => messages.push(msg),
    });

    broadcastRawResourceCreated({
      id: "raw-123",
      type: "pdf",
      filename: "document.pdf",
    });

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe("raw_resource_created");
  });

  test("broadcastProcessingLogCreated sends correct event", () => {
    const messages: string[] = [];
    websocketBroadcaster.addClient({
      id: "test-client",
      send: (msg) => messages.push(msg),
    });

    broadcastProcessingLogCreated({
      id: "log-123",
      operation: "ingest",
    });

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe("processing_log_created");
  });
});
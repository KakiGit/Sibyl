import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { websocketBroadcaster } from "./broadcaster.js";
import { ulid } from "ulid";

export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  fastify.register(async function (fastify) {
    fastify.get("/ws", { websocket: true }, (socket, _req) => {
      const clientId = ulid();
      const subscriptions = new Set<string>();

      const client = {
        id: clientId,
        send: (message: string) => {
          try {
            socket.send(message);
          } catch {
            websocketBroadcaster.removeClient(clientId);
          }
        },
        subscriptions,
      };

      websocketBroadcaster.addClient(client);

      socket.on("message", (rawMessage: Buffer) => {
        try {
          const message = JSON.parse(rawMessage.toString());
          
          if (message.type === "subscribe" && Array.isArray(message.events)) {
            message.events.forEach((event: string) => subscriptions.add(event));
            socket.send(JSON.stringify({
              type: "subscribed",
              events: Array.from(subscriptions),
              clientId,
            }));
          }

          if (message.type === "unsubscribe" && Array.isArray(message.events)) {
            message.events.forEach((event: string) => subscriptions.delete(event));
            socket.send(JSON.stringify({
              type: "unsubscribed",
              events: Array.from(subscriptions),
              clientId,
            }));
          }

          if (message.type === "ping") {
            socket.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch {
          socket.send(JSON.stringify({
            type: "error",
            message: "Invalid message format",
          }));
        }
      });

      socket.on("close", () => {
        websocketBroadcaster.removeClient(clientId);
      });

      socket.on("error", () => {
        websocketBroadcaster.removeClient(clientId);
      });

      socket.send(JSON.stringify({
        type: "connected",
        clientId,
        timestamp: Date.now(),
      }));
    });
  });
}

export function getWebSocketStats(): {
  connectedClients: number;
  clientIds: string[];
} {
  return {
    connectedClients: websocketBroadcaster.getClientCount(),
    clientIds: websocketBroadcaster.getConnectedClients(),
  };
}
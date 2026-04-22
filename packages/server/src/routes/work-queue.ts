import type { FastifyInstance } from "fastify";
import { llmWorkQueue } from "../llm/index.js";
import { broadcastWorkQueueUpdated } from "../websocket/broadcaster.js";

export async function registerWorkQueueRoutes(fastify: FastifyInstance): Promise<void> {
  llmWorkQueue.subscribe((status) => {
    broadcastWorkQueueUpdated(status);
  });

  fastify.get("/api/work-queue/status", async () => {
    return llmWorkQueue.getStatus();
  });
}
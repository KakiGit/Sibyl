import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { registerWorkQueueRoutes } from "./work-queue.js";
import { llmWorkQueue } from "../llm/work-queue.js";

let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  fastify = Fastify({ logger: false });
  await registerWorkQueueRoutes(fastify);
});

afterEach(async () => {
  await fastify.close();
});

describe("Work Queue Routes", () => {
  describe("GET /api/work-queue/status", () => {
    it("should return work queue status", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/work-queue/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.active).toBeDefined();
      expect(body.queueLength).toBeDefined();
      expect(body.currentItem).toBeDefined();
    });

    it("should return inactive status when queue is empty", async () => {
      while (llmWorkQueue.getStatus().active || llmWorkQueue.getStatus().queueLength > 0) {
        await new Promise<void>((r) => setTimeout(r, 10));
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/work-queue/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.active).toBe(false);
      expect(body.queueLength).toBe(0);
      expect(body.currentItem).toBe(null);
    });

    it("should return active status when task is processing", async () => {
      const slowPromise = llmWorkQueue.enqueue("test", "Slow task", async () => {
        await new Promise<void>((r) => setTimeout(r, 100));
        return "done";
      });

      await new Promise<void>((r) => setTimeout(r, 10));

      const response = await fastify.inject({
        method: "GET",
        url: "/api/work-queue/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.active).toBe(true);
      expect(body.queueLength).toBe(1);
      expect(body.currentItem).not.toBe(null);
      expect(body.currentItem?.operation).toBe("test");

      await slowPromise;
    });
  });
});
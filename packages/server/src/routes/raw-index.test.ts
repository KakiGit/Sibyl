import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, RawResourceFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerRawIndexRoutes } from "./raw-index.js";
import type { RawResource } from "@sibyl/sdk";

let testDbDir: string;
let testDbPath: string;
let rawManager: RawResourceFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-raw-index-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  rawManager = new RawResourceFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerRawIndexRoutes(fastify, { rawResourceFileManager: rawManager });
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

async function createRawResource(
  type: "pdf" | "image" | "webpage" | "text",
  filename: string,
  processed: boolean = false,
  metadata?: Record<string, unknown>
): Promise<RawResource> {
  const resource = await storage.rawResources.create({
    type,
    filename,
    contentPath: join(testDbDir, "raw", "documents", filename),
    sourceUrl: type === "webpage" ? `https://example.com/${filename}` : undefined,
    metadata,
  });

  let finalResource = resource;

  if (processed) {
    finalResource = await storage.rawResources.update(resource.id, { processed: true });
  }

  rawManager.addToIndex(finalResource!);
  return finalResource!;
}

describe("Raw Index Routes", () => {
  describe("GET /api/raw-index", () => {
    it("should return empty index when no resources", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.version).toBe(1);
      expect(body.data.totalResources).toBe(0);
      expect(body.data.entries).toEqual([]);
      expect(body.data.stats).toBeDefined();
      expect(body.data.indexPath).toBeDefined();
    });

    it("should return index entries after creating resources", async () => {
      await createRawResource("pdf", "document.pdf");
      await createRawResource("webpage", "page.html", true);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalResources).toBe(2);
      expect(body.data.entries.length).toBe(2);

      const pdfEntry = body.data.entries.find((e: { type: string }) => e.type === "pdf");
      expect(pdfEntry).toBeDefined();
      expect(pdfEntry.filename).toBe("document.pdf");

      const webpageEntry = body.data.entries.find((e: { type: string }) => e.type === "webpage");
      expect(webpageEntry).toBeDefined();
      expect(webpageEntry.processed).toBe(true);
    });

    it("should return correct stats for different resource types", async () => {
      await createRawResource("pdf", "doc1.pdf");
      await createRawResource("pdf", "doc2.pdf", true);
      await createRawResource("image", "photo.jpg");
      await createRawResource("webpage", "article.html", true);
      await createRawResource("text", "notes.txt", true);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.stats.pdfCount).toBe(2);
      expect(body.data.stats.imageCount).toBe(1);
      expect(body.data.stats.webpageCount).toBe(1);
      expect(body.data.stats.textCount).toBe(1);
      expect(body.data.stats.processedCount).toBe(3);
      expect(body.data.stats.unprocessedCount).toBe(2);
    });

    it("should include updatedAt timestamp", async () => {
      await createRawResource("pdf", "doc.pdf");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.updatedAt).toBeDefined();
      expect(typeof body.data.updatedAt).toBe("number");
    });

    it("should include metadata in entries", async () => {
      await createRawResource("pdf", "doc.pdf", false, { author: "Test Author", pageCount: 10 });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      const entry = body.data.entries.find((e: { type: string }) => e.type === "pdf");
      expect(entry.metadata).toBeDefined();
      expect(entry.metadata.author).toBe("Test Author");
    });
  });

  describe("GET /api/raw-index/stats", () => {
    it("should return stats only without full entries", async () => {
      await createRawResource("pdf", "doc.pdf");
      await createRawResource("image", "img.jpg", true);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.stats).toBeDefined();
      expect(body.data.stats.pdfCount).toBe(1);
      expect(body.data.stats.imageCount).toBe(1);
      expect(body.data.stats.processedCount).toBe(1);
      expect(body.data.stats.unprocessedCount).toBe(1);
      expect(body.data.indexPath).toBeDefined();
    });

    it("should return zero stats when no resources", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.stats.pdfCount).toBe(0);
      expect(body.data.stats.imageCount).toBe(0);
      expect(body.data.stats.webpageCount).toBe(0);
      expect(body.data.stats.textCount).toBe(0);
      expect(body.data.stats.processedCount).toBe(0);
      expect(body.data.stats.unprocessedCount).toBe(0);
    });
  });

  describe("GET /api/raw-index/unprocessed", () => {
    it("should return empty when all resources processed", async () => {
      await createRawResource("pdf", "doc.pdf", true);
      await createRawResource("webpage", "page.html", true);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/unprocessed",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.unprocessedCount).toBe(0);
      expect(body.data.entries).toEqual([]);
    });

    it("should return only unprocessed resources", async () => {
      await createRawResource("pdf", "unprocessed.pdf", false);
      await createRawResource("pdf", "processed.pdf", true);
      await createRawResource("image", "unprocessed-img.jpg", false);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/unprocessed",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.unprocessedCount).toBe(2);
      expect(body.data.entries.length).toBe(2);

      const allUnprocessed = body.data.entries.every((e: { processed: boolean }) => !e.processed);
      expect(allUnprocessed).toBe(true);
    });

    it("should include resource details in unprocessed entries", async () => {
      await createRawResource("pdf", "todo.pdf", false, { priority: "high" });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/unprocessed",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      const entry = body.data.entries[0];
      expect(entry.id).toBeDefined();
      expect(entry.type).toBe("pdf");
      expect(entry.filename).toBe("todo.pdf");
      expect(entry.metadata.priority).toBe("high");
    });
  });

  describe("GET /api/raw-index/:type", () => {
    it("should return all pdf resources", async () => {
      await createRawResource("pdf", "doc1.pdf");
      await createRawResource("pdf", "doc2.pdf", true);
      await createRawResource("image", "photo.jpg");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/pdf",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("pdf");
      expect(body.data.count).toBe(2);
      expect(body.data.entries.length).toBe(2);

      const allPdfs = body.data.entries.every((e: { type: string }) => e.type === "pdf");
      expect(allPdfs).toBe(true);
    });

    it("should return all image resources", async () => {
      await createRawResource("image", "img1.jpg");
      await createRawResource("image", "img2.png", true);
      await createRawResource("pdf", "doc.pdf");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/image",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("image");
      expect(body.data.count).toBe(2);
    });

    it("should return all webpage resources", async () => {
      await createRawResource("webpage", "page1.html");
      await createRawResource("webpage", "page2.html", true);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/webpage",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("webpage");
      expect(body.data.count).toBe(2);

      const entryWithUrl = body.data.entries.find((e: { sourceUrl?: string }) => e.sourceUrl);
      expect(entryWithUrl.sourceUrl).toBeDefined();
    });

    it("should return all text resources", async () => {
      await createRawResource("text", "note1.txt");
      await createRawResource("text", "note2.txt", true);
      await createRawResource("pdf", "doc.pdf");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/text",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("text");
      expect(body.data.count).toBe(2);
    });

    it("should return empty for type with no resources", async () => {
      await createRawResource("pdf", "doc.pdf");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/image",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("image");
      expect(body.data.count).toBe(0);
      expect(body.data.entries).toEqual([]);
    });

    it("should return 400 for invalid type", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/invalid",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Invalid resource type");
    });
  });

  describe("POST /api/raw-index/rebuild", () => {
    it("should rebuild index from database resources", async () => {
      await createRawResource("pdf", "doc.pdf");
      await createRawResource("image", "img.jpg", true);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/raw-index/rebuild",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.success).toBe(true);
      expect(body.data.totalResources).toBe(2);
      expect(body.data.message).toBe("Raw resource index rebuilt successfully");
      expect(body.data.updatedAt).toBeDefined();
    });

    it("should create empty index when database has no resources", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/raw-index/rebuild",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.success).toBe(true);
      expect(body.data.totalResources).toBe(0);
    });

    it("should replace existing index entries", async () => {
      await createRawResource("pdf", "old-doc.pdf");
      await createRawResource("image", "old-img.jpg");

      const newResource = await storage.rawResources.create({
        type: "text",
        filename: "new-note.txt",
        contentPath: join(testDbDir, "raw", "documents", "new-note.txt"),
        processed: true,
      });

      rawManager.addToIndex(newResource);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/raw-index/rebuild",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalResources).toBe(3);

      const indexResponse = await fastify.inject({
        method: "GET",
        url: "/api/raw-index",
      });
      const indexBody = JSON.parse(indexResponse.body);
      expect(indexBody.data.stats.textCount).toBe(1);
    });

    it("should update stats after rebuild", async () => {
      await createRawResource("pdf", "doc1.pdf");
      await createRawResource("pdf", "doc2.pdf", true);
      await createRawResource("webpage", "page.html");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/raw-index/rebuild",
      });

      expect(response.statusCode).toBe(200);

      const statsResponse = await fastify.inject({
        method: "GET",
        url: "/api/raw-index/stats",
      });
      const statsBody = JSON.parse(statsResponse.body);
      expect(statsBody.data.stats.pdfCount).toBe(2);
      expect(statsBody.data.stats.webpageCount).toBe(1);
      expect(statsBody.data.stats.processedCount).toBe(1);
      expect(statsBody.data.stats.unprocessedCount).toBe(2);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import { resetLlmProvider, setLlmProviderForTest, LlmProvider } from "../llm/index.js";
import { wikiSearchStorage } from "../search/index.js";
import Fastify from "fastify";
import { registerIngestRoutes } from "./ingest.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-ingest-route-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });
  mkdirSync(join(testWikiDir, "concept"), { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerIngestRoutes(fastify);
});

afterEach(async () => {
  closeDatabase();
  resetLlmProvider();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

describe("Ingest Routes", () => {
  describe("POST /api/ingest/text", () => {
    it("should ingest text content and create wiki page", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "test-document.txt",
          content: "This is test content for ingestion into the wiki.",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.rawResourceId).toBeDefined();
      expect(body.data.wikiPageId).toBeDefined();
      expect(body.data.slug).toBe("test-document");
      expect(body.data.title).toBe("Test Document");
      expect(body.data.processed).toBe(true);
    });

    it("should ingest with custom title", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "custom-test.txt",
          content: "Custom content here.",
          title: "My Custom Title",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.title).toBe("My Custom Title");
      expect(body.data.slug).toBe("my-custom-title");
    });

    it("should ingest with custom type", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "entity-test.txt",
          content: "Entity description.",
          type: "entity",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("entity");

      const wikiPage = await storage.wikiPages.findBySlug("entity-test");
      expect(wikiPage?.type).toBe("entity");
    });

    it("should ingest with tags", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "tagged-doc.txt",
          content: "Tagged content.",
          tags: ["important", "research", "draft"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const wikiPage = await storage.wikiPages.findBySlug(body.data.slug);
      expect(wikiPage?.tags).toContain("important");
      expect(wikiPage?.tags).toContain("research");
      expect(wikiPage?.tags).toContain("draft");
    });

    it("should require filename field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          content: "Content without filename.",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should require content field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "no-content.txt",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate wiki page type", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/text",
        payload: {
          filename: "invalid-type.txt",
          content: "Invalid type content.",
          type: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/ingest/llm", () => {
    it("should require filename field for LLM ingestion", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/llm",
        payload: {
          content: "Content without filename.",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should require content field for LLM ingestion", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/llm",
        payload: {
          filename: "no-content.txt",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate type option", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/llm",
        payload: {
          filename: "invalid-type.txt",
          content: "Test content.",
          type: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/ingest/batch", () => {
    it("should process unprocessed resources", async () => {
      await storage.rawResources.create({
        type: "text",
        filename: "batch-1.txt",
        contentPath: join(testRawDir, "documents", "batch-1.txt"),
        metadata: {},
      });
      writeFileSync(join(testRawDir, "documents", "batch-1.txt"), "Batch content 1.");

      await storage.rawResources.create({
        type: "text",
        filename: "batch-2.txt",
        contentPath: join(testRawDir, "documents", "batch-2.txt"),
        metadata: {},
      });
      writeFileSync(join(testRawDir, "documents", "batch-2.txt"), "Batch content 2.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/batch",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.processed.length).toBe(2);
      expect(body.data.failed.length).toBe(0);
      expect(body.data.total).toBe(2);
    });

    it("should return empty results when no unprocessed resources", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/ingest/batch",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.processed.length).toBe(0);
      expect(body.data.total).toBe(0);
    });
  });

  describe("GET /api/ingest/status", () => {
    it("should return status counts", async () => {
      const resource1 = await storage.rawResources.create({
        type: "text",
        filename: "status-1.txt",
        contentPath: join(testRawDir, "documents", "status-1.txt"),
        metadata: {},
      });
      await storage.rawResources.update(resource1.id, { processed: true });

      await storage.rawResources.create({
        type: "text",
        filename: "status-2.txt",
        contentPath: join(testRawDir, "documents", "status-2.txt"),
        metadata: {},
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/ingest/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.total).toBe(2);
      expect(body.data.processed).toBe(1);
      expect(body.data.unprocessed).toBe(1);
    });

    it("should return zero counts when no resources", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/ingest/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.total).toBe(0);
      expect(body.data.processed).toBe(0);
      expect(body.data.unprocessed).toBe(0);
    });
  });

  describe("POST /api/ingest/llm/:id", () => {
    it("should find and update existing wiki page via semantic search", async () => {
      const mockLlmProvider = {
        name: "mock-provider",
        call: async () => ({
          content: JSON.stringify({
            title: "Reprocess Test",
            summary: "A test for re-processing.",
            content: "# Reprocess Test\n\nTest content for re-processing.",
            tags: ["test", "reprocess"],
            type: "concept",
            crossReferences: [],
          }),
          model: "mock-model",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
        synthesize: async () => "Mock response",
        getConfig: () => ({ baseUrl: "https://mock.api", apiKey: "mock-key", model: "mock-model", maxTokens: 4096 }),
      } as unknown as LlmProvider;

      setLlmProviderForTest(mockLlmProvider);

      const existingPage = await storage.wikiPages.create({
        slug: "reprocess-test-existing",
        title: "Reprocess Test",
        type: "concept",
        contentPath: join(testWikiDir, "concept", "reprocess-test-existing.md"),
        summary: "A test for re-processing.",
        tags: ["existing"],
      });

      wikiManager.createPage({
        title: "Reprocess Test",
        type: "concept",
        slug: "reprocess-test-existing",
        content: "# Reprocess Test\n\nOriginal existing content.",
        summary: "A test for re-processing.",
        tags: ["existing"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await wikiSearchStorage.indexPage(existingPage, wikiManager);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "reprocess-test.txt",
        contentPath: join(testRawDir, "documents", "reprocess-test.txt"),
        metadata: {},
      });
      writeFileSync(join(testRawDir, "documents", "reprocess-test.txt"), "Original content for testing re-processing.");

      await storage.rawResources.update(rawResource.id, { processed: true });

      const response = await fastify.inject({
        method: "POST",
        url: `/api/ingest/llm/${rawResource.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.rawResourceId).toBe(rawResource.id);
      expect(body.data.wikiPageId).toBe(existingPage.id);
      expect(body.data.processed).toBe(true);

      const updatedPage = await storage.wikiPages.findById(existingPage.id);
      expect(updatedPage?.sourceIds).toContain(rawResource.id);
    });

    it("should create new wiki page when no relevant page found", async () => {
      const mockLlmProvider = {
        name: "mock-provider",
        call: async () => ({
          content: JSON.stringify({
            title: "New Unique Topic",
            summary: "A completely different topic with no existing match.",
            content: "# New Unique Topic\n\nBrand new content.",
            tags: ["new", "unique"],
            type: "concept",
            crossReferences: [],
          }),
          model: "mock-model",
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        }),
        synthesize: async () => "Mock response",
        getConfig: () => ({ baseUrl: "https://mock.api", apiKey: "mock-key", model: "mock-model", maxTokens: 4096 }),
      } as unknown as LlmProvider;

      setLlmProviderForTest(mockLlmProvider);

      const unrelatedPage = await storage.wikiPages.create({
        slug: "unrelated-topic",
        title: "Gardening Tips for Spring",
        type: "concept",
        contentPath: join(testWikiDir, "concept", "unrelated-topic.md"),
        summary: "Best practices for planting flowers and vegetables in your garden.",
        tags: ["gardening", "plants"],
      });

      wikiManager.createPage({
        title: "Gardening Tips for Spring",
        type: "concept",
        slug: "unrelated-topic",
        content: "# Gardening Tips for Spring\n\nHow to grow plants successfully.",
        summary: "Best practices for planting flowers and vegetables in your garden.",
        tags: ["gardening", "plants"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await wikiSearchStorage.indexPage(unrelatedPage, wikiManager);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "new-topic.txt",
        contentPath: join(testRawDir, "documents", "new-topic.txt"),
        metadata: {},
      });
      writeFileSync(join(testRawDir, "documents", "new-topic.txt"), "Content about a new unique topic.");

      const response = await fastify.inject({
        method: "POST",
        url: `/api/ingest/llm/${rawResource.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.rawResourceId).toBe(rawResource.id);
      expect(body.data.wikiPageId).not.toBe(unrelatedPage.id);
      expect(body.data.title).toBe("New Unique Topic");
      expect(body.data.processed).toBe(true);
    });
  });
});
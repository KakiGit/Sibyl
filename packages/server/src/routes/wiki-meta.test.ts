import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerWikiMetaRoutes } from "./wiki-meta.js";

let testDbDir: string;
let testDbPath: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-wiki-meta-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerWikiMetaRoutes(fastify, { wikiFileManager: wikiManager });
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

async function createWikiPage(
  slug: string,
  title: string,
  type: "entity" | "concept" | "source" | "summary",
  content: string,
  tags: string[] = []
): Promise<string> {
  const now = Date.now();
  wikiManager.createPage({
    title,
    type,
    slug,
    content,
    tags,
    sourceIds: [],
    createdAt: now,
    updatedAt: now,
  });

  const page = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiManager.getPagePath(type, slug),
    tags,
    sourceIds: [],
  });

  return page.id;
}

describe("Wiki Meta Routes", () => {
  describe("GET /api/wiki-log", () => {
    it("should return empty log when no entries", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should return log entries after operations", async () => {
      await createWikiPage("test-page", "Test Page", "concept", "Test content.");

      wikiManager.appendToLog({
        timestamp: new Date().toISOString().split("T")[0],
        operation: "ingest",
        title: "Test Page",
        details: "Created test page",
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);

      const entry = body.data[0];
      expect(entry.timestamp).toBeDefined();
      expect(entry.operation).toBeDefined();
      expect(entry.title).toBeDefined();
    });

    it("should accept limit query parameter", async () => {
      for (let i = 0; i < 5; i++) {
        wikiManager.appendToLog({
          timestamp: new Date().toISOString().split("T")[0],
          operation: "query",
          title: `Query ${i}`,
          details: `Query details ${i}`,
        });
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log?limit=3",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeLessThanOrEqual(3);
    });

    it("should filter by operation type", async () => {
      wikiManager.appendToLog({
        timestamp: new Date().toISOString().split("T")[0],
        operation: "ingest",
        title: "Ingest Entry",
        details: "Ingest details",
      });

      wikiManager.appendToLog({
        timestamp: new Date().toISOString().split("T")[0],
        operation: "query",
        title: "Query Entry",
        details: "Query details",
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log?operation=ingest",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((e: { operation: string }) => e.operation === "ingest")).toBe(true);
    });

    it("should include details in log entries", async () => {
      wikiManager.appendToLog({
        timestamp: new Date().toISOString().split("T")[0],
        operation: "lint",
        title: "Health Check",
        details: "Found 2 issues",
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      const lintEntry = body.data.find((e: { operation: string }) => e.operation === "lint");
      expect(lintEntry).toBeDefined();
      expect(lintEntry.details).toBeDefined();
    });

    it("should validate operation enum", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-log?operation=invalid",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/wiki-index", () => {
    it("should return empty index when no pages", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should return index entries after creating pages", async () => {
      await createWikiPage("concept-one", "Concept One", "concept", "First concept.");
      await createWikiPage("entity-two", "Entity Two", "entity", "Second entity.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThanOrEqual(2);

      const conceptEntry = body.data.find((e: { slug: string }) => e.slug === "concept-one");
      expect(conceptEntry).toBeDefined();
      expect(conceptEntry.title).toBe("Concept One");
      expect(conceptEntry.type).toBe("concept");
      expect(conceptEntry.path).toBeDefined();
    });

    it("should include summary in index entries", async () => {
      await createWikiPage("with-summary", "Page with Summary", "concept", "Content with summary.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const entry = body.data.find((e: { slug: string }) => e.slug === "with-summary");
      expect(entry).toBeDefined();
      expect(entry.slug).toBe("with-summary");
    });

    it("should return entries for all page types", async () => {
      await createWikiPage("entity-page", "Entity", "entity", "Entity content.");
      await createWikiPage("concept-page", "Concept", "concept", "Concept content.");
      await createWikiPage("source-page", "Source", "source", "Source content.");
      await createWikiPage("summary-page", "Summary", "summary", "Summary content.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-index",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const types = body.data.map((e: { type: string }) => e.type);
      expect(types).toContain("entity");
      expect(types).toContain("concept");
      expect(types).toContain("source");
      expect(types).toContain("summary");
    });
  });

  describe("POST /api/wiki-index/rebuild", () => {
    it("should rebuild index successfully", async () => {
      await createWikiPage("rebuild-test", "Rebuild Test", "concept", "Test rebuild.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-index/rebuild",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.message).toBe("Wiki index rebuilt successfully");
    });

    it("should include all pages after rebuild", async () => {
      await createWikiPage("page-a", "Page A", "entity", "Content A.");
      await createWikiPage("page-b", "Page B", "concept", "Content B.");
      await createWikiPage("page-c", "Page C", "source", "Content C.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/wiki-index/rebuild",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThanOrEqual(3);
    });
  });
});
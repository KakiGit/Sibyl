import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, wikiFileManager, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerLintRoutes } from "./lint.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let originalWikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-lint-route-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  originalWikiManager = wikiFileManager;
  const testWikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerLintRoutes(fastify);
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
  const testWikiManager = new WikiFileManager(testDbDir);
  testWikiManager.createPage({
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
    contentPath: testWikiManager.getPagePath(type, slug),
    tags,
    sourceIds: [],
  });

  return page.id;
}

async function createLink(fromPageId: string, toPageId: string): Promise<void> {
  await storage.wikiLinks.create({
    fromPageId,
    toPageId,
    relationType: "reference",
  });
}

describe("Lint Routes", () => {
  describe("POST /api/lint", () => {
    it("should return lint report with POST method", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/lint",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.totalPages).toBeDefined();
      expect(body.data.issues).toBeDefined();
      expect(body.data.lintedAt).toBeDefined();
    });

    it("should accept lint options in body", async () => {
      await createWikiPage("test", "Test Page", "concept", "Content.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/lint",
        payload: {
          checkOrphans: true,
          checkStale: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });
  });

  describe("GET /api/lint", () => {
    it("should return lint report with GET method", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.totalPages).toBeDefined();
      expect(body.data.issues).toBeDefined();
    });

    it("should accept query parameters", async () => {
      await createWikiPage("test", "Test", "concept", "Content.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint?checkOrphans=true&checkStale=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });
  });

  describe("GET /api/lint/orphans", () => {
    it("should return orphan pages endpoint", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/orphans",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /api/lint/missing-references", () => {
    it("should return missing references endpoint", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/missing-references",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /api/lint/conflicts", () => {
    it("should return potential conflicts endpoint", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/conflicts",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /api/lint/stale", () => {
    it("should return stale pages endpoint", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/stale",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should accept threshold query parameter", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/stale?thresholdDays=30",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });
  });

  describe("GET /api/lint/history", () => {
    it("should return lint history endpoint", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should accept limit query parameter", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/history?limit=5",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });
  });

  describe("POST /api/lint/llm", () => {
    it("should return LLM-enhanced lint report with POST method", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/lint/llm",
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.analyzedPages).toBeDefined();
      expect(body.data.issues).toBeDefined();
      expect(body.data.analyzedAt).toBeDefined();
      expect(Array.isArray(body.data.issues)).toBe(true);
      expect(Array.isArray(body.data.contradictions)).toBe(true);
      expect(Array.isArray(body.data.missingConcepts)).toBe(true);
      expect(Array.isArray(body.data.improvementSuggestions)).toBe(true);
      expect(Array.isArray(body.data.newSourceSuggestions)).toBe(true);
    });

    it("should accept LLM lint options in body", async () => {
      await createWikiPage("test", "Test Page", "concept", "Content for testing.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/lint/llm",
        payload: {
          maxPagesToAnalyze: 5,
          skipLlm: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.analyzedPages).toBe(1);
    });

    it("should return basic report when skipLlm is true", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/lint/llm",
        payload: {
          skipLlm: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.modelUsed).toBeUndefined();
    });
  });

  describe("GET /api/lint/llm", () => {
    it("should return LLM-enhanced lint report with GET method", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/llm",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.analyzedPages).toBeDefined();
      expect(body.data.issues).toBeDefined();
    });

    it("should accept query parameters for LLM lint", async () => {
      await createWikiPage("test1", "Test Page 1", "concept", "Content 1.");
      await createWikiPage("test2", "Test Page 2", "entity", "Content 2.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/llm?maxPagesToAnalyze=2&skipLlm=true",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it("should handle empty wiki gracefully", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/lint/llm?skipLlm=true",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.analyzedPages).toBe(0);
      expect(body.data.issues.length).toBeGreaterThan(0);
      expect(body.data.newSourceSuggestions.length).toBeGreaterThan(0);
    });
  });
});
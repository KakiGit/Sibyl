import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer } from "../server.js";
import { closeDatabase, createDatabase, migrateDatabase, setDatabase } from "../database.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { resetLlmProvider, LlmProvider } from "../llm/index.js";
import type { FastifyInstance } from "fastify";
import { resolve } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync } from "fs";

let server: FastifyInstance;
let testDbPath: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  resetLlmProvider();
  testDbPath = resolve(tmpdir(), `sibyl-marp-route-test-${Date.now()}.db`);
  const testWikiPath = resolve(tmpdir(), `sibyl-marp-wiki-route-${Date.now()}`);
  mkdirSync(testWikiPath, { recursive: true });
  mkdirSync(resolve(testWikiPath, "entities"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "concepts"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "sources"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "summaries"), { recursive: true });

  wikiManager = new WikiFileManager(testWikiPath);

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  server = await createServer({ dbPath: testDbPath });
});

afterEach(async () => {
  await server.close();
  closeDatabase();
  resetLlmProvider();
  try {
    rmSync(testDbPath, { force: true });
  } catch {}
});

describe("Marp API Routes", () => {
  describe("POST /api/marp", () => {
    it("should generate slides from page slugs", async () => {
      const page = await storage.wikiPages.create({
        slug: "api-test-concept",
        title: "API Test Concept",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "api-test-concept"),
        summary: "API test",
        tags: ["api"],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "API Test Concept",
        type: "concept",
        slug: "api-test-concept",
        content: `# Overview

API test content.

# Features

- Feature A
- Feature B`,
        summary: "API test",
        tags: ["api"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/marp",
        payload: {
          pageSlugs: ["api-test-concept"],
          title: "API Test Presentation",
          theme: "default",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.title).toBe("API Test Presentation");
      expect(body.data.marpContent).toContain("marp: true");
      expect(body.data.sourcePages.length).toBe(1);
      expect(body.data.sourcePages[0].slug).toBe("api-test-concept");
    });

    it("should generate slides from query search", async () => {
      await storage.wikiPages.create({
        slug: "searchable-topic",
        title: "Searchable Topic",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "searchable-topic"),
        summary: "Searchable content about searchable things",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "Searchable Topic",
        type: "concept",
        slug: "searchable-topic",
        content: "# Searchable Topic\n\nThis is searchable content about a topic. The word searchable appears here.",
        summary: "Searchable content about searchable things",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/marp",
        payload: {
          pageSlugs: ["searchable-topic"],
          title: "Search Results Presentation",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sourcePages.length).toBe(1);
    });

    it("should handle useLlm parameter gracefully", async () => {
      await storage.wikiPages.create({
        slug: "llm-handle-test",
        title: "LLM Handle Test",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "llm-handle-test"),
        summary: "Test",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "LLM Handle Test",
        type: "concept",
        slug: "llm-handle-test",
        content: "Test content",
        summary: "Test",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/marp",
        payload: {
          pageSlugs: ["llm-handle-test"],
          useLlm: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sourcePages.length).toBe(1);
    });

    it("should support different themes", async () => {
      await storage.wikiPages.create({
        slug: "theme-test",
        title: "Theme Test",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "theme-test"),
        summary: "Theme test",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "Theme Test",
        type: "concept",
        slug: "theme-test",
        content: "Theme test content",
        summary: "Theme test",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/marp",
        payload: {
          pageSlugs: ["theme-test"],
          theme: "gaia",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.theme).toBe("gaia");
      expect(body.data.marpContent).toContain("theme: gaia");
    });

    it("should return 500 when no pages found", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/marp",
        payload: {
          pageSlugs: ["non-existent-page"],
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe("GET /api/marp/:slug", () => {
    it("should generate slides from single page", async () => {
      await storage.wikiPages.create({
        slug: "single-page-test",
        title: "Single Page Test",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "single-page-test"),
        summary: "Single page",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "Single Page Test",
        type: "concept",
        slug: "single-page-test",
        content: "Single page content for slide generation.",
        summary: "Single page",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/marp/single-page-test",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.sourcePages.length).toBe(1);
      expect(body.data.sourcePages[0].slug).toBe("single-page-test");
    });

    it("should return 404 for non-existent page", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/marp/non-existent",
      });

      expect(response.statusCode).toBe(404);
    });

    it("should accept theme and paginate query params", async () => {
      await storage.wikiPages.create({
        slug: "params-test",
        title: "Params Test",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "params-test"),
        summary: "Params",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "Params Test",
        type: "concept",
        slug: "params-test",
        content: "Params test",
        summary: "Params",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/marp/params-test?theme=uncover",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.theme).toBe("uncover");
      expect(body.data.marpContent).toContain("theme: uncover");
    });
  });

  describe("POST /api/marp/file", () => {
    it("should save Marp content as wiki page", async () => {
      const marpContent = `---
marp: true
theme: default
---

# Saved Presentation

Slide content.`;

      const response = await server.inject({
        method: "POST",
        url: "/api/marp/file",
        payload: {
          marpContent,
          title: "Saved Marp Deck",
          type: "summary",
          tags: ["presentation", "marp"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.slug).toBe("saved-marp-deck");
      expect(body.data.title).toBe("Saved Marp Deck");
      expect(body.data.type).toBe("summary");

      const savedPage = await storage.wikiPages.findBySlug("saved-marp-deck");
      expect(savedPage).toBeDefined();
    });

    it("should update existing page with same slug", async () => {
      await storage.wikiPages.create({
        slug: "existing-marp",
        title: "Existing Marp",
        type: "summary",
        contentPath: wikiManager.getPagePath("summary", "existing-marp"),
        summary: "Old summary",
        tags: [],
        sourceIds: [],
      });

      wikiManager.createPage({
        title: "Existing Marp",
        type: "summary",
        slug: "existing-marp",
        content: "Old content",
        summary: "Old summary",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const newMarpContent = `---
marp: true
---

# Updated Presentation`;

      const response = await server.inject({
        method: "POST",
        url: "/api/marp/file",
        payload: {
          marpContent: newMarpContent,
          title: "Existing Marp",
          type: "summary",
          tags: ["updated"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.message).toContain("updated");
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerWikiStatsRoutes } from "./wiki-stats.js";
import { registerWikiPageRoutes } from "./wiki-pages.js";

let testDbDir: string;
let testDbPath: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-wiki-stats-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  
  mkdirSync(join(testDbDir, "wiki", "entities"), { recursive: true });
  mkdirSync(join(testDbDir, "wiki", "concepts"), { recursive: true });
  mkdirSync(join(testDbDir, "wiki", "sources"), { recursive: true });
  mkdirSync(join(testDbDir, "wiki", "summaries"), { recursive: true });
  
  testDbPath = join(testDbDir, "test.db");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerWikiStatsRoutes(fastify, { wikiFileManager: wikiManager });
  await registerWikiPageRoutes(fastify);
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
  tags: string[] = [],
  summary?: string
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
    summary,
  });

  return page.id;
}

describe("Wiki Stats Routes", () => {
  describe("GET /api/wiki-stats", () => {
    it("should return zero stats when no pages exist", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.totalPages).toBe(0);
      expect(body.data.pagesByType.entity).toBe(0);
      expect(body.data.pagesByType.concept).toBe(0);
      expect(body.data.pagesByType.source).toBe(0);
      expect(body.data.pagesByType.summary).toBe(0);
      expect(body.data.totalTags).toBe(0);
      expect(body.data.averageContentLength).toBe(0);
      expect(body.data.totalContentLength).toBe(0);
    });

    it("should return correct page counts by type", async () => {
      await createWikiPage("entity-1", "Entity One", "entity", "Content for entity.");
      await createWikiPage("concept-1", "Concept One", "concept", "Content for concept.");
      await createWikiPage("source-1", "Source One", "source", "Content for source.");
      await createWikiPage("summary-1", "Summary One", "summary", "Content for summary.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalPages).toBe(4);
      expect(body.data.pagesByType.entity).toBe(1);
      expect(body.data.pagesByType.concept).toBe(1);
      expect(body.data.pagesByType.source).toBe(1);
      expect(body.data.pagesByType.summary).toBe(1);
    });

    it("should count total tags correctly", async () => {
      await createWikiPage("tagged-1", "Tagged Page 1", "concept", "Content.", ["ai", "ml"]);
      await createWikiPage("tagged-2", "Tagged Page 2", "concept", "Content.", ["ai", "python"]);
      await createWikiPage("untagged", "Untagged", "entity", "Content.", []);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalTags).toBe(3);
      expect(body.data.tagsDistribution.ai).toBe(2);
      expect(body.data.tagsDistribution.ml).toBe(1);
      expect(body.data.tagsDistribution.python).toBe(1);
    });

    it("should calculate content length metrics", async () => {
      await createWikiPage("short", "Short Page", "concept", "Short content.");
      await createWikiPage("long", "Long Page", "concept", "This is a longer content with more characters to test the average calculation.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalContentLength).toBeGreaterThan(0);
      expect(body.data.averageContentLength).toBeGreaterThan(0);
    });

    it("should count pages with wiki links", async () => {
      await createWikiPage("linked-1", "Linked Page 1", "concept", "Content with [[other-page]] link.");
      await createWikiPage("linked-2", "Linked Page 2", "concept", "Content with [[another-page]] and [[third-page]] links.");
      await createWikiPage("unlinked", "Unlinked Page", "entity", "No links here.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pagesWithLinks).toBe(2);
    });

    it("should count pages with summary", async () => {
      await createWikiPage("with-summary", "Page with Summary", "concept", "Content.", [], "This is a summary");
      await createWikiPage("without-summary", "Page without Summary", "entity", "Content.", []);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pagesWithSummary).toBe(1);
    });

    it("should count pages with tags", async () => {
      await createWikiPage("tagged", "Tagged Page", "concept", "Content.", ["test"]);
      await createWikiPage("untagged", "Untagged Page", "entity", "Content.", []);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pagesWithTags).toBe(1);
    });

    it("should return recent pages sorted by update time", async () => {
      const now = Date.now();
      
      await createWikiPage("page-1", "Page 1", "concept", "Content 1.");
      await createWikiPage("page-2", "Page 2", "concept", "Content 2.");
      await createWikiPage("page-3", "Page 3", "concept", "Content 3.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.recentPages.length).toBeGreaterThan(0);
      expect(body.data.recentPages[0].title).toBeDefined();
      expect(body.data.recentPages[0].slug).toBeDefined();
      expect(body.data.recentPages[0].updatedAt).toBeDefined();
    });

    it("should identify oldest and newest pages", async () => {
      await createWikiPage("first", "First Page", "concept", "First content.");
      await createWikiPage("second", "Second Page", "concept", "Second content.");
      await createWikiPage("third", "Third Page", "concept", "Third content.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.oldestPage).toBeDefined();
      expect(body.data.newestPage).toBeDefined();
      expect(body.data.oldestPage.title).toBeDefined();
      expect(body.data.newestPage.title).toBeDefined();
    });

    it("should limit recent pages to 5 entries", async () => {
      for (let i = 0; i < 10; i++) {
        await createWikiPage(`page-${i}`, `Page ${i}`, "concept", `Content for page ${i}.`);
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.recentPages.length).toBeLessThanOrEqual(5);
    });
  });

  describe("GET /api/wiki-stats/tags", () => {
    it("should return empty array when no tags exist", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/tags",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it("should return tags sorted by count descending", async () => {
      await createWikiPage("page-1", "Page 1", "concept", "Content.", ["popular", "common"]);
      await createWikiPage("page-2", "Page 2", "concept", "Content.", ["popular"]);
      await createWikiPage("page-3", "Page 3", "concept", "Content.", ["popular", "rare"]);
      await createWikiPage("page-4", "Page 4", "concept", "Content.", ["rare"]);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/tags",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBe(3);
      expect(body.data[0].tag).toBe("popular");
      expect(body.data[0].count).toBe(3);
    });

    it("should include tag and count for each entry", async () => {
      await createWikiPage("tagged", "Tagged Page", "concept", "Content.", ["test-tag"]);

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/tags",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data[0].tag).toBe("test-tag");
      expect(body.data[0].count).toBe(1);
    });
  });

  describe("GET /api/wiki-stats/activity", () => {
    it("should return zero activity when no pages exist", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/activity",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.last24Hours).toBe(0);
      expect(body.data.lastWeek).toBe(0);
      expect(body.data.lastMonth).toBe(0);
      expect(body.data.older).toBe(0);
    });

    it("should classify pages by update time", async () => {
      await createWikiPage("new-page", "New Page", "concept", "Recent content.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/activity",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const total = body.data.last24Hours + body.data.lastWeek + body.data.lastMonth + body.data.older;
      expect(total).toBeGreaterThan(0);
    });

    it("should return all activity fields", async () => {
      await createWikiPage("test", "Test Page", "concept", "Test content.");

      const response = await fastify.inject({
        method: "GET",
        url: "/api/wiki-stats/activity",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.last24Hours).toBeDefined();
      expect(body.data.lastWeek).toBeDefined();
      expect(body.data.lastMonth).toBeDefined();
      expect(body.data.older).toBeDefined();
    });
  });
});
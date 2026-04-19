import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import { ingestRawResource } from "../processors/ingest.js";
import Fastify from "fastify";
import { registerFilingRoutes } from "./filing.js";
import { registerIngestRoutes } from "./ingest.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-filing-route-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerFilingRoutes(fastify);
  await registerIngestRoutes(fastify);
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

function createRawContentFile(filename: string, content: string): string {
  const filePath = join(testRawDir, "documents", filename);
  writeFileSync(filePath, content);
  return filePath;
}

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

describe("Filing Routes", () => {
  describe("POST /api/filing", () => {
    it("should file content and create wiki page", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Test Filing",
          content: "This is filed content from a synthesis.",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.wikiPageId).toBeDefined();
      expect(body.data.slug).toBe("test-filing");
      expect(body.data.title).toBe("Test Filing");
      expect(body.data.type).toBe("summary");
      expect(body.data.linkedPages).toBeDefined();
      expect(body.data.filedAt).toBeDefined();
    });

    it("should file content with custom type", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Custom Type Test",
          content: "Content with custom type.",
          type: "concept",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.type).toBe("concept");
    });

    it("should file content with tags", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Tagged Content",
          content: "Content with tags.",
          tags: ["research", "analysis", "test"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const wikiPage = await storage.wikiPages.findBySlug(body.data.slug);
      expect(wikiPage?.tags).toContain("research");
      expect(wikiPage?.tags).toContain("analysis");
      expect(wikiPage?.tags).toContain("test");
    });

    it("should file content with custom summary", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Custom Summary",
          content: "Long content here.",
          summary: "This is a custom summary.",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const wikiPage = await storage.wikiPages.findBySlug(body.data.slug);
      expect(wikiPage?.summary).toBe("This is a custom summary.");
    });

    it("should file content with source page links", async () => {
      const pageId1 = await createWikiPage("source-1", "Source One", "concept", "Content one.");
      const pageId2 = await createWikiPage("source-2", "Source Two", "concept", "Content two.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Linked Content",
          content: "Content linked to sources.",
          sourcePageIds: [pageId1, pageId2],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.linkedPages.length).toBe(2);

      const links = await storage.wikiLinks.findByFromPageId(body.data.wikiPageId);
      expect(links.length).toBe(2);
    });

    it("should require title field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          content: "Content without title.",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should require content field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Title without content",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should validate wiki page type", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Invalid Type",
          content: "Content.",
          type: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should create processing log entry", async () => {
      await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Log Test",
          content: "Testing log entry.",
        },
      });

      const logs = await storage.processingLog.findByOperation("filing");
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].operation).toBe("filing");
    });
  });

  describe("POST /api/filing/query", () => {
    beforeEach(async () => {
      await createWikiPage("python", "Python Programming", "concept", "Python is a high-level programming language.");
      await createWikiPage("javascript", "JavaScript Guide", "concept", "JavaScript is used for web development.");
      await createWikiPage("react", "React Framework", "concept", "React is a JavaScript library for UI.");
    });

    it("should file query result as summary page", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "programming",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.type).toBe("summary");
      expect(body.data.linkedPages.length).toBeGreaterThan(0);
    });

    it("should use custom title for filed query result", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "JavaScript",
          title: "JavaScript Research Summary",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.title).toBe("JavaScript Research Summary");
      expect(body.data.slug).toBe("javascript-research-summary");
    });

    it("should include filing tags", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "Python",
          filingTags: ["research", "important"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const wikiPage = await storage.wikiPages.findBySlug(body.data.slug);
      expect(wikiPage?.tags).toContain("research");
      expect(wikiPage?.tags).toContain("important");
    });

    it("should filter by types", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "programming",
          types: ["concept"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const wikiPage = await storage.wikiPages.findBySlug(body.data.slug);
      expect(wikiPage?.type).toBe("summary");
    });

    it("should limit pages with maxPages parameter", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "programming",
          maxPages: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.linkedPages.length).toBeLessThanOrEqual(2);
    });

    it("should require query field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          title: "No Query",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return error when no matches found", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "nonexistentxyzabc",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("No matching wiki pages");
    });

    it("should create processing log entry for query filing", async () => {
      await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "React",
        },
      });

      const logs = await storage.processingLog.findByOperation("filing");
      expect(logs.length).toBeGreaterThan(0);
    });

    it("should create wiki links to matched pages", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/filing/query",
        payload: {
          query: "JavaScript",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const links = await storage.wikiLinks.findByFromPageId(body.data.wikiPageId);
      expect(links.length).toBeGreaterThan(0);
      expect(links[0].relationType).toBe("reference");
    });
  });

  describe("GET /api/filing/history", () => {
    it("should return empty history when no filings", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/filing/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(0);
    });

    it("should return filing history", async () => {
      await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "First Filing",
          content: "First filed content.",
        },
      });

      await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "Second Filing",
          content: "Second filed content.",
        },
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/filing/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBe(2);
      expect(body.data[0].title).toBe("Second Filing");
      expect(body.data[1].title).toBe("First Filing");
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await fastify.inject({
          method: "POST",
          url: "/api/filing",
          payload: {
            title: `Filing Item ${i}`,
            content: `Content ${i}.`,
          },
        });
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/filing/history?limit=3",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBe(3);
    });

    it("should include required fields in history entries", async () => {
      await fastify.inject({
        method: "POST",
        url: "/api/filing",
        payload: {
          title: "History Entry Test",
          content: "Testing history fields.",
        },
      });

      const response = await fastify.inject({
        method: "GET",
        url: "/api/filing/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);

      const entry = body.data[0];
      expect(entry.wikiPageId).toBeDefined();
      expect(entry.title).toBeDefined();
      expect(entry.slug).toBeDefined();
      expect(entry.filedAt).toBeDefined();
    });
  });
});
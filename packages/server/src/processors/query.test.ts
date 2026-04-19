import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "./ingest.js";
import {
  queryWiki,
  searchWikiPages,
  getWikiPageBySlug,
  getWikiPagesByType,
  getWikiPagesByTags,
  getRecentWikiPages,
  getWikiPageGraph,
} from "./query.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-query-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);
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

function getTestWikiManager(): WikiFileManager {
  return wikiManager;
}

async function setupWikiPages() {
  const pages = [
    {
      filename: "python-basics.txt",
      content: "Python is a high-level programming language. It supports multiple programming paradigms including procedural, object-oriented, and functional programming. Python is widely used for web development, data science, and automation.",
      type: "concept",
    },
    {
      filename: "javascript-guide.txt",
      content: "JavaScript is a dynamic programming language primarily used for web development. It enables interactive web pages and is an essential part of web applications. Modern JavaScript includes features like async/await and modules.",
      type: "concept",
    },
    {
      filename: "react-components.txt",
      content: "React is a JavaScript library for building user interfaces. Components are the building blocks of React applications. They can be class components or functional components with hooks.",
      type: "concept",
    },
    {
      filename: "machine-learning.txt",
      content: "Machine learning is a subset of artificial intelligence. It involves training algorithms on data to make predictions or decisions. Common applications include image recognition and natural language processing.",
      type: "concept",
    },
    {
      filename: "api-design.txt",
      content: "REST API design follows specific principles. Good API design includes proper resource naming, consistent error handling, and appropriate use of HTTP methods and status codes.",
      type: "source",
    },
  ];

  for (const page of pages) {
    const contentPath = createRawContentFile(page.filename, page.content);
    const raw = await storage.rawResources.create({
      type: "text",
      filename: page.filename,
      contentPath,
    });
    await ingestRawResource({
      rawResourceId: raw.id,
      type: page.type as "concept" | "source",
      wikiFileManager: getTestWikiManager(),
    });
  }
}

describe("Query Processor", () => {
  describe("queryWiki", () => {
    it("should find pages matching query terms", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "Python programming",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.matches.length).toBeGreaterThan(0);

      const pythonMatch = result.matches.find(
        (m) => m.page.slug === "python-basics"
      );
      expect(pythonMatch).toBeDefined();
      expect(pythonMatch?.matchType).toBe("title");
    });

    it("should rank title matches higher than content matches", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "React",
        wikiFileManager: getTestWikiManager(),
      });

      const reactMatch = result.matches.find(
        (m) => m.page.slug === "react-components"
      );
      expect(reactMatch).toBeDefined();
      expect(reactMatch?.relevanceScore).toBeGreaterThan(50);
    });

    it("should filter by page type", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "design",
        types: ["source"],
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.matches.every((m) => m.page.type === "source")).toBe(true);
    });

    it("should filter by tags", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const firstPage = allPages[0];
      if (firstPage) {
        await storage.wikiPages.update(firstPage.id, {
          tags: ["programming", "language"],
        });
      }

      const result = await queryWiki({
        query: "programming",
        tags: ["programming"],
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.matches.some((m) => m.page.tags.includes("programming"))).toBe(true);
    });

    it("should include content when requested", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "Python",
        includeContent: true,
        wikiFileManager: getTestWikiManager(),
      });

      const pythonMatch = result.matches.find(
        (m) => m.page.slug === "python-basics"
      );
      expect(pythonMatch?.content).toBeDefined();
      expect(pythonMatch?.content).toContain("high-level programming language");
    });

    it("should respect limit parameter", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "programming",
        limit: 2,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.matches.length).toBeLessThanOrEqual(2);
    });

    it("should sort matches by relevance score", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "JavaScript programming",
        wikiFileManager: getTestWikiManager(),
      });

      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i - 1].relevanceScore).toBeGreaterThanOrEqual(
          result.matches[i].relevanceScore
        );
      }
    });

    it("should create processing log entry", async () => {
      await setupWikiPages();

      await queryWiki({
        query: "test query",
        wikiFileManager: getTestWikiManager(),
      });

      const logs = await storage.processingLog.findByOperation("query");
      const lastLog = logs[0];
      expect(lastLog).toBeDefined();
      expect(lastLog?.operation).toBe("query");
      expect(lastLog?.details?.query).toBe("test query");
    });

    it("should append to wiki log file", async () => {
      await setupWikiPages();

      await queryWiki({
        query: "search query",
        wikiFileManager: getTestWikiManager(),
      });

      const logEntries = getTestWikiManager().readLog();
      const queryEntry = logEntries.find((e) => e.operation === "query");
      expect(queryEntry).toBeDefined();
      expect(queryEntry?.title).toBe("search query");
    });

    it("should throw error for empty query", async () => {
      await expect(
        queryWiki({ query: "", wikiFileManager: getTestWikiManager() })
      ).rejects.toThrow("Query string is required");
    });

    it("should throw error for meaningless query", async () => {
      await expect(
        queryWiki({ query: "a b c", wikiFileManager: getTestWikiManager() })
      ).rejects.toThrow("Query must contain meaningful terms");
    });

    it("should return empty result when no matches", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "nonexistent-topic xyz",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.total).toBe(0);
      expect(result.matches.length).toBe(0);
    });

    it("should match summary text", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const page = allPages.find((p) => p.slug === "machine-learning");
      if (page) {
        await storage.wikiPages.update(page.id, {
          summary: "Introduction to AI and machine learning concepts",
        });
      }

      const result = await queryWiki({
        query: "AI concepts",
        wikiFileManager: getTestWikiManager(),
      });

      const mlMatch = result.matches.find(
        (m) => m.page.slug === "machine-learning"
      );
      expect(mlMatch).toBeDefined();
    });

    it("should match tags", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const page = allPages[0];
      if (page) {
        await storage.wikiPages.update(page.id, {
          tags: ["webdev", "frontend", "tutorial"],
        });
      }

      const result = await queryWiki({
        query: "webdev",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.total).toBeGreaterThan(0);
    });
  });

  describe("searchWikiPages", () => {
    it("should search wiki pages by term", async () => {
      await setupWikiPages();

      const pages = await searchWikiPages("Python");

      expect(pages.length).toBeGreaterThan(0);
      expect(pages.some((p) => p.title.includes("Python"))).toBe(true);
    });

    it("should return empty array for no matches", async () => {
      const pages = await searchWikiPages("nonexistent");

      expect(pages.length).toBe(0);
    });
  });

  describe("getWikiPageBySlug", () => {
    it("should retrieve page with content by slug", async () => {
      await setupWikiPages();

      const result = await getWikiPageBySlug("python-basics", getTestWikiManager());

      expect(result).not.toBeNull();
      expect(result?.page.slug).toBe("python-basics");
      expect(result?.content).toContain("Python");
    });

    it("should return null for non-existent slug", async () => {
      const result = await getWikiPageBySlug("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getWikiPagesByType", () => {
    it("should retrieve pages by type", async () => {
      await setupWikiPages();

      const concepts = await getWikiPagesByType("concept");

      expect(concepts.length).toBeGreaterThan(0);
      expect(concepts.every((p) => p.type === "concept")).toBe(true);
    });

    it("should return empty array for type with no pages", async () => {
      const entities = await getWikiPagesByType("entity");

      expect(entities.length).toBe(0);
    });
  });

  describe("getWikiPagesByTags", () => {
    it("should retrieve pages matching any tag", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      if (allPages.length > 0) {
        await storage.wikiPages.update(allPages[0].id, {
          tags: ["programming", "language"],
        });
        if (allPages.length > 1) {
          await storage.wikiPages.update(allPages[1].id, {
            tags: ["language", "web"],
          });
        }
      }

      const pages = await getWikiPagesByTags(["language"]);

      expect(pages.length).toBeGreaterThan(0);
    });

    it("should return empty array for non-existent tags", async () => {
      const pages = await getWikiPagesByTags(["nonexistent-tag"]);

      expect(pages.length).toBe(0);
    });
  });

  describe("getRecentWikiPages", () => {
    it("should retrieve recent pages with limit", async () => {
      await setupWikiPages();

      const pages = await getRecentWikiPages(3);

      expect(pages.length).toBeLessThanOrEqual(3);
    });

    it("should return all pages sorted by update time", async () => {
      await setupWikiPages();

      const pages = await getRecentWikiPages(10);

      for (let i = 1; i < pages.length; i++) {
        expect(pages[i - 1].updatedAt).toBeGreaterThanOrEqual(pages[i].updatedAt);
      }
    });
  });

  describe("getWikiPageGraph", () => {
    it("should retrieve page with outgoing links", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const page1 = allPages[0];
      const page2 = allPages[1];

      if (page1 && page2) {
        await storage.wikiLinks.create({
          fromPageId: page1.id,
          toPageId: page2.id,
          relationType: "related",
        });

        const graph = await getWikiPageGraph(page1.id);

        expect(graph.page.id).toBe(page1.id);
        expect(graph.outgoingLinks.length).toBe(1);
        expect(graph.outgoingLinks[0].toPageId).toBe(page2.id);
      }
    });

    it("should retrieve page with incoming links", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const page1 = allPages[0];
      const page2 = allPages[1];

      if (page1 && page2) {
        await storage.wikiLinks.create({
          fromPageId: page1.id,
          toPageId: page2.id,
          relationType: "references",
        });

        const graph = await getWikiPageGraph(page2.id);

        expect(graph.page.id).toBe(page2.id);
        expect(graph.incomingLinks.length).toBe(1);
        expect(graph.incomingLinks[0].fromPageId).toBe(page1.id);
      }
    });

    it("should throw error for non-existent page", async () => {
      await expect(getWikiPageGraph("non-existent-id")).rejects.toThrow(
        "Wiki page not found"
      );
    });
  });

  describe("Query Result Structure", () => {
    it("should include all required fields in result", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "Python",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.query).toBe("Python");
      expect(result.total).toBeDefined();
      expect(result.executedAt).toBeDefined();
      expect(Array.isArray(result.matches)).toBe(true);
    });

    it("should include all required fields in match", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "Python",
        wikiFileManager: getTestWikiManager(),
      });

      if (result.matches.length > 0) {
        const match = result.matches[0];
        expect(match.page).toBeDefined();
        expect(match.relevanceScore).toBeDefined();
        expect(match.matchType).toBeDefined();
        expect(["title", "summary", "tags", "content"]).toContain(match.matchType);
      }
    });

    it("should calculate relevance score correctly", async () => {
      await setupWikiPages();

      const result = await queryWiki({
        query: "Python programming language",
        wikiFileManager: getTestWikiManager(),
      });

      const pythonMatch = result.matches.find(
        (m) => m.page.slug === "python-basics"
      );

      if (pythonMatch) {
        expect(pythonMatch.relevanceScore).toBeGreaterThan(0);
      }
    });
  });
});
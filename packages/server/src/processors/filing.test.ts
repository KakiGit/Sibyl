import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "./ingest.js";
import { queryWiki } from "./query.js";
import {
  fileContent,
  fileQueryResult,
  fileAnalysis,
  getFilingHistory,
} from "./filing.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-filing-test-${Date.now()}`);
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
      content: "Python is a high-level programming language. It supports multiple programming paradigms.",
    },
    {
      filename: "javascript-guide.txt",
      content: "JavaScript is a dynamic programming language primarily used for web development.",
    },
    {
      filename: "react-components.txt",
      content: "React is a JavaScript library for building user interfaces.",
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
      wikiFileManager: getTestWikiManager(),
    });
  }
}

describe("Filing Processor", () => {
  describe("fileContent", () => {
    it("should create a new wiki page from filed content", async () => {
      await setupWikiPages();

      const result = await fileContent({
        title: "Programming Languages Overview",
        content: "A comprehensive overview of popular programming languages including Python, JavaScript, and React framework.",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.wikiPageId).toBeDefined();
      expect(result.slug).toBe("programming-languages-overview");
      expect(result.title).toBe("Programming Languages Overview");
      expect(result.type).toBe("summary");

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage).not.toBeNull();
      expect(wikiPage?.type).toBe("summary");

      const pageContent = getTestWikiManager().readPage("summary", result.slug);
      expect(pageContent).not.toBeNull();
      expect(pageContent?.content).toContain("programming languages");
    });

    it("should create wiki links to source pages", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const sourcePageIds = allPages.slice(0, 2).map((p) => p.id);

      const result = await fileContent({
        title: "Related Programming Topics",
        content: "This summary links to Python and JavaScript topics.",
        sourcePageIds,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.linkedPages.length).toBe(2);

      const links = await storage.wikiLinks.findByFromPageId(result.wikiPageId);
      expect(links.length).toBe(2);
      expect(links[0].relationType).toBe("reference");
    });

    it("should use custom type when provided", async () => {
      const result = await fileContent({
        title: "Machine Learning Concept",
        content: "Machine learning involves training algorithms on data.",
        type: "concept",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.type).toBe("concept");

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.type).toBe("concept");
    });

    it("should use custom tags when provided", async () => {
      const result = await fileContent({
        title: "API Design Patterns",
        content: "Best practices for designing REST APIs.",
        tags: ["api", "rest", "design"],
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.tags).toContain("api");
      expect(wikiPage?.tags).toContain("rest");
      expect(wikiPage?.tags).toContain("design");
    });

    it("should use custom summary when provided", async () => {
      const result = await fileContent({
        title: "Custom Summary Test",
        content: "Long content that would normally generate a different summary.",
        summary: "This is a custom summary.",
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.summary).toBe("This is a custom summary.");
    });

    it("should generate summary from content when not provided", async () => {
      const result = await fileContent({
        title: "Auto Summary Test",
        content: "This is the first sentence. This is the second sentence that should be ignored.",
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.summary).toContain("first sentence");
    });

    it("should update existing page if slug exists", async () => {
      const result1 = await fileContent({
        title: "Duplicate Title",
        content: "First version of content.",
        wikiFileManager: getTestWikiManager(),
      });

      const result2 = await fileContent({
        title: "Duplicate Title",
        content: "Second version of content with updates.",
        tags: ["updated"],
        wikiFileManager: getTestWikiManager(),
      });

      expect(result2.wikiPageId).toBe(result1.wikiPageId);

      const wikiPage = await storage.wikiPages.findBySlug(result2.slug);
      expect(wikiPage?.tags).toContain("updated");

      const logs = await storage.processingLog.findByOperation("filing");
      const lastLog = logs.find((l) => l.wikiPageId === result1.wikiPageId);
      expect(lastLog?.details?.action).toBe("updated");
    });

    it("should create processing log entry", async () => {
      await fileContent({
        title: "Log Entry Test",
        content: "Content for testing log entries.",
        wikiFileManager: getTestWikiManager(),
      });

      const logs = await storage.processingLog.findByOperation("filing");
      const lastLog = logs[0];
      expect(lastLog).toBeDefined();
      expect(lastLog?.operation).toBe("filing");
      expect(lastLog?.details?.title).toBe("Log Entry Test");
      expect(lastLog?.details?.action).toBe("created");
    });

    it("should append to wiki log file", async () => {
      await fileContent({
        title: "Wiki Log Test",
        content: "Content for testing wiki log.",
        wikiFileManager: getTestWikiManager(),
      });

      const logEntries = getTestWikiManager().readLog();
      const filingEntry = logEntries.find((e) => e.operation === "filing");
      expect(filingEntry).toBeDefined();
      expect(filingEntry?.title).toBe("Wiki Log Test");
    });

    it("should update wiki index", async () => {
      await fileContent({
        title: "Index Test Page",
        content: "Content for testing index update.",
        wikiFileManager: getTestWikiManager(),
      });

      const index = getTestWikiManager().getIndex();
      const entry = index.find((e) => e.slug === "index-test-page");
      expect(entry).toBeDefined();
      expect(entry?.title).toBe("Index Test Page");
      expect(entry?.type).toBe("summary");
    });

    it("should handle missing source pages gracefully", async () => {
      const result = await fileContent({
        title: "Missing Source Test",
        content: "Content with missing source references.",
        sourcePageIds: ["non-existent-page-id"],
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.linkedPages.length).toBe(0);
    });

    it("should not duplicate existing links", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const sourcePageId = allPages[0].id;

      await fileContent({
        title: "First Filing",
        content: "First content.",
        sourcePageIds: [sourcePageId],
        wikiFileManager: getTestWikiManager(),
      });

      const result2 = await fileContent({
        title: "First Filing",
        content: "Updated content.",
        sourcePageIds: [sourcePageId],
        wikiFileManager: getTestWikiManager(),
      });

      const links = await storage.wikiLinks.findByFromPageId(result2.wikiPageId);
      expect(links.length).toBe(1);
    });
  });

  describe("fileQueryResult", () => {
    it("should file a query result as a summary page", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "Python programming",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      expect(filingResult.type).toBe("summary");
      expect(filingResult.title).toContain("Python");
      expect(filingResult.linkedPages.length).toBe(queryResult.matches.length);

      const pageContent = getTestWikiManager().readPage("summary", filingResult.slug);
      expect(pageContent?.content).toContain("Python programming");
      expect(pageContent?.content).toContain("Related Pages");
    });

    it("should use custom title when provided", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "JavaScript",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        title: "JavaScript Research Summary",
        wikiFileManager: getTestWikiManager(),
      });

      expect(filingResult.title).toBe("JavaScript Research Summary");
      expect(filingResult.slug).toBe("javascript-research-summary");
    });

    it("should aggregate tags from matched pages", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      await storage.wikiPages.update(allPages[0].id, { tags: ["programming"] });
      await storage.wikiPages.update(allPages[1].id, { tags: ["web", "frontend"] });

      const queryResult = await queryWiki({
        query: "programming language",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(filingResult.slug);
      expect(wikiPage?.tags.length).toBeGreaterThan(0);
    });

    it("should include custom tags", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "React",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        tags: ["research", "summary"],
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(filingResult.slug);
      expect(wikiPage?.tags).toContain("research");
      expect(wikiPage?.tags).toContain("summary");
    });

    it("should throw error for empty query result", async () => {
      await expect(
        fileQueryResult({
          queryResult: {
            query: "test",
            matches: [],
            total: 0,
            executedAt: Date.now(),
          },
          wikiFileManager: getTestWikiManager(),
        })
      ).rejects.toThrow("Query result has no matches to file");
    });

    it("should include relevance information in content", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "Python",
        includeContent: true,
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      const pageContent = getTestWikiManager().readPage("summary", filingResult.slug);
      expect(pageContent?.content).toContain("Relevance:");
      expect(pageContent?.content).toContain("score:");
    });

    it("should create links to all matched pages", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "programming",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      const links = await storage.wikiLinks.findByFromPageId(filingResult.wikiPageId);
      expect(links.length).toBe(queryResult.matches.length);
    });
  });

  describe("fileAnalysis", () => {
    it("should file an analysis as a summary page", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const relatedIds = allPages.slice(0, 2).map((p) => p.id);

      const result = await fileAnalysis(
        "Programming Languages Analysis",
        "This analysis compares Python and JavaScript for web development.",
        relatedIds,
        { wikiFileManager: getTestWikiManager() }
      );

      expect(result.type).toBe("summary");
      expect(result.title).toBe("Programming Languages Analysis");
      expect(result.linkedPages.length).toBe(2);
    });

    it("should include custom tags in analysis filing", async () => {
      await setupWikiPages();

      const allPages = await storage.wikiPages.findAll({ limit: 100 });
      const relatedIds = [allPages[0].id];

      const result = await fileAnalysis(
        "Deep Analysis",
        "Detailed analysis content.",
        relatedIds,
        { tags: ["analysis", "deep-dive"], wikiFileManager: getTestWikiManager() }
      );

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.tags).toContain("analysis");
      expect(wikiPage?.tags).toContain("deep-dive");
    });
  });

  describe("getFilingHistory", () => {
    it("should return filing history", async () => {
      await fileContent({
        title: "History Test 1",
        content: "First filed content.",
        wikiFileManager: getTestWikiManager(),
      });

      await fileContent({
        title: "History Test 2",
        content: "Second filed content.",
        wikiFileManager: getTestWikiManager(),
      });

      const history = await getFilingHistory(10);

      expect(history.length).toBe(2);
      expect(history[0].title).toBe("History Test 2");
      expect(history[1].title).toBe("History Test 1");
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await fileContent({
          title: `History Item ${i}`,
          content: `Content ${i}.`,
          wikiFileManager: getTestWikiManager(),
        });
      }

      const history = await getFilingHistory(3);

      expect(history.length).toBe(3);
    });

    it("should return empty history when no filings", async () => {
      const history = await getFilingHistory(10);

      expect(history.length).toBe(0);
    });
  });

  describe("Filing Result Structure", () => {
    it("should include all required fields in result", async () => {
      const result = await fileContent({
        title: "Complete Result Test",
        content: "Testing complete result structure.",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.wikiPageId).toBeDefined();
      expect(result.slug).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.linkedPages).toBeDefined();
      expect(result.filedAt).toBeDefined();
      expect(typeof result.filedAt).toBe("number");
    });

    it("should return consistent slug format", async () => {
      const result = await fileContent({
        title: "Test Title With Special Characters!",
        content: "Content with special characters in title.",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.slug).toMatch(/^[a-z0-9-]+$/);
      expect(result.slug).toBe("test-title-with-special-characters");
    });
  });

  describe("Wiki Page Content Quality", () => {
    it("should create properly formatted markdown", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "Python",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      const pageContent = getTestWikiManager().readPage("summary", filingResult.slug);
      expect(pageContent?.content).toMatch(/^# .+/);
      expect(pageContent?.content).toContain("##");
    });

    it("should include wiki-style links in content", async () => {
      await setupWikiPages();

      const queryResult = await queryWiki({
        query: "JavaScript",
        wikiFileManager: getTestWikiManager(),
      });

      const filingResult = await fileQueryResult({
        queryResult,
        wikiFileManager: getTestWikiManager(),
      });

      const pageContent = getTestWikiManager().readPage("summary", filingResult.slug);
      expect(pageContent?.content).toContain("[[");
      expect(pageContent?.content).toContain("]]");
    });

    it("should include frontmatter in wiki file", async () => {
      const result = await fileContent({
        title: "Frontmatter Test",
        content: "Testing frontmatter generation.",
        tags: ["test", "frontmatter"],
        wikiFileManager: getTestWikiManager(),
      });

      const pageContent = getTestWikiManager().readPage("summary", result.slug);
      expect(pageContent?.title).toBe("Frontmatter Test");
      expect(pageContent?.tags).toContain("test");
      expect(pageContent?.createdAt).toBeDefined();
      expect(pageContent?.updatedAt).toBeDefined();
    });
  });
});
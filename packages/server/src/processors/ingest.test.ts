import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource, ingestUnprocessedResources, reingestRawResource } from "./ingest.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-ingest-test-${Date.now()}`);
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

describe("Ingest Processor", () => {
  describe("ingestRawResource", () => {
    it("should ingest a text raw resource and create a wiki page", async () => {
      const content = "Python is a high-level programming language known for its simplicity and readability. It is widely used in web development, data science, and automation.";
      const contentPath = createRawContentFile("python-intro.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "python-intro.txt",
        contentPath,
      });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.rawResourceId).toBe(rawResource.id);
      expect(result.slug).toBe("python-intro");
      expect(result.title).toBe("Python Intro");
      expect(result.type).toBe("concept");
      expect(result.processed).toBe(true);

      const updatedResource = await storage.rawResources.findById(rawResource.id);
      expect(updatedResource?.processed).toBe(true);

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage).not.toBeNull();
      expect(wikiPage?.title).toBe("Python Intro");
      expect(wikiPage?.type).toBe("concept");
      expect(wikiPage?.sourceIds).toContain(rawResource.id);

      const pageContent = getTestWikiManager().readPage("concept", result.slug);
      expect(pageContent).not.toBeNull();
      expect(pageContent?.content).toContain("Python is a high-level");
      expect(pageContent?.tags).toContain("python");
    });

    it("should ingest a webpage raw resource as source type", async () => {
      const content = "This article discusses best practices for REST API design. Key points include using proper HTTP methods and status codes.";
      const contentPath = createRawContentFile("rest-api-best-practices.html", content);

      const rawResource = await storage.rawResources.create({
        type: "webpage",
        filename: "rest-api-best-practices.html",
        contentPath,
        sourceUrl: "https://example.com/rest-api",
      });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.type).toBe("source");
      expect(result.slug).toBe("rest-api-best-practices");

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.type).toBe("source");
    });

    it("should use custom title and type when provided", async () => {
      const content = "Some content about machine learning algorithms.";
      const contentPath = createRawContentFile("ml-notes.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "ml-notes.txt",
        contentPath,
      });

      const result = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: "Machine Learning Overview",
        type: "summary",
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.title).toBe("Machine Learning Overview");
      expect(result.slug).toBe("machine-learning-overview");
      expect(result.type).toBe("summary");
    });

    it("should use custom tags when provided", async () => {
      const content = "Content about artificial intelligence and neural networks.";
      const contentPath = createRawContentFile("ai-doc.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "ai-doc.txt",
        contentPath,
      });

      const result = await ingestRawResource({
        rawResourceId: rawResource.id,
        tags: ["ai", "neural-networks", "deep-learning"],
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug(result.slug);
      expect(wikiPage?.tags).toEqual(["ai", "neural-networks", "deep-learning"]);
    });

    it("should use metadata title if available", async () => {
      const content = "Article content about TypeScript type system.";
      const contentPath = createRawContentFile("typescript-article.md", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "typescript-article.md",
        contentPath,
        metadata: { title: "TypeScript Type System Deep Dive" },
      });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.title).toBe("TypeScript Type System Deep Dive");
      expect(result.slug).toBe("typescript-type-system-deep-dive");
    });

    it("should create processing log entry", async () => {
      const content = "Some test content for logging.";
      const contentPath = createRawContentFile("test-log.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "test-log.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const logs = await storage.processingLog.findByOperation("ingest");
      const lastLog = logs.find((l) => l.rawResourceId === rawResource.id);
      expect(lastLog).toBeDefined();
      expect(lastLog?.details?.action).toBe("created");
    });

    it("should append to wiki log file", async () => {
      const content = "Content for log testing.";
      const contentPath = createRawContentFile("log-test.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "log-test.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const logEntries = getTestWikiManager().readLog();
      const lastEntry = logEntries[logEntries.length - 1];
      expect(lastEntry?.operation).toBe("ingest");
      expect(lastEntry?.title).toContain("Log Test");
    });

it("should update existing wiki page if slug exists", async () => {
      const content1 = "Initial content about React components.";
      const contentPath1 = createRawContentFile("react-components-1.txt", content1);

      const rawResource1 = await storage.rawResources.create({
        type: "text",
        filename: "react-components-1.txt",
        contentPath: contentPath1,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource1.id,
        title: "React Components",
        wikiFileManager: getTestWikiManager(),
      });

      const content2 = "Additional content about React hooks and state management.";
      const contentPath2 = createRawContentFile("react-components-2.txt", content2);

      const rawResource2 = await storage.rawResources.create({
        type: "text",
        filename: "react-components-2.txt",
        contentPath: contentPath2,
      });

      const result = await ingestRawResource({
        rawResourceId: rawResource2.id,
        title: "React Components",
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug("react-components");
      expect(wikiPage?.sourceIds).toHaveLength(2);
      expect(wikiPage?.sourceIds).toContain(rawResource1.id);
      expect(wikiPage?.sourceIds).toContain(rawResource2.id);

      const logs = await storage.processingLog.findByRawResourceId(rawResource2.id);
      expect(logs[0]?.details?.action).toBe("updated");
    });

    it("should throw error for non-existent raw resource", async () => {
      await expect(
        ingestRawResource({ rawResourceId: "non-existent-id" })
      ).rejects.toThrow("Raw resource not found");
    });

    it("should throw error when content file not found", async () => {
      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "missing.txt",
        contentPath: join(testRawDir, "documents", "missing.txt"),
      });

      await expect(
        ingestRawResource({ 
          rawResourceId: rawResource.id,
          wikiFileManager: getTestWikiManager(),
        })
      ).rejects.toThrow("Content file not found");
    });

    it("should generate meaningful summary from content", async () => {
      const content = "This comprehensive guide explores the fundamentals of Docker containerization. Docker enables developers to package applications into containers that can run consistently across different environments.";
      const contentPath = createRawContentFile("docker-guide.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "docker-guide.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug("docker-guide");
      expect(wikiPage?.summary).toBeDefined();
      expect(wikiPage?.summary?.length).toBeLessThanOrEqual(200);
      expect(wikiPage?.summary).toContain("Docker");
    });

    it("should extract relevant tags from content", async () => {
      const content = "JavaScript is a versatile programming language used extensively in web development. Modern JavaScript frameworks like React and Vue have revolutionized frontend development. Node.js enables JavaScript to run on servers, making it a full-stack solution.";
      const contentPath = createRawContentFile("javascript-ecosystem.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "javascript-ecosystem.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug("javascript-ecosystem");
      expect(wikiPage?.tags).toContain("javascript");
    });

    it("should handle already processed resource", async () => {
      const content = "Already processed content.";
      const contentPath = createRawContentFile("processed.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "processed.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      await storage.rawResources.update(rawResource.id, { processed: true });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.processed).toBe(true);

      const logs = await storage.processingLog.findByRawResourceId(rawResource.id);
      expect(logs.length).toBe(1);
    });

    it("should re-process with autoProcess flag", async () => {
      const content = "Content to re-process.";
      const contentPath = createRawContentFile("reprocess.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "reprocess.txt",
        contentPath,
        processed: true,
      });

      const result = await ingestRawResource({
        rawResourceId: rawResource.id,
        autoProcess: true,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.processed).toBe(true);

      const logs = await storage.processingLog.findByRawResourceId(rawResource.id);
      expect(logs.length).toBe(1);
    });

    it("should update wiki index", async () => {
      const content = "Content for index testing.";
      const contentPath = createRawContentFile("index-test.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "index-test.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const index = getTestWikiManager().getIndex();
      const entry = index.find((e) => e.slug === "index-test");
      expect(entry).toBeDefined();
      expect(entry?.title).toBe("Index Test");
      expect(entry?.type).toBe("concept");
    });
  });

  describe("ingestUnprocessedResources", () => {
    it("should process all unprocessed resources", async () => {
      const content1 = "First document content about algorithms.";
      const contentPath1 = createRawContentFile("algorithms.txt", content1);
      const raw1 = await storage.rawResources.create({
        type: "text",
        filename: "algorithms.txt",
        contentPath: contentPath1,
      });

      const content2 = "Second document content about data structures.";
      const contentPath2 = createRawContentFile("data-structures.txt", content2);
      const raw2 = await storage.rawResources.create({
        type: "text",
        filename: "data-structures.txt",
        contentPath: contentPath2,
      });

      const result = await ingestUnprocessedResources({ wikiFileManager: getTestWikiManager() });

      expect(result.total).toBe(2);
      expect(result.processed.length).toBe(2);
      expect(result.failed.length).toBe(0);

      const updated1 = await storage.rawResources.findById(raw1.id);
      expect(updated1?.processed).toBe(true);

      const updated2 = await storage.rawResources.findById(raw2.id);
      expect(updated2?.processed).toBe(true);
    });

    it("should handle mixed success and failures", async () => {
      const content = "Valid content.";
      const validPath = createRawContentFile("valid.txt", content);
      const validResource = await storage.rawResources.create({
        type: "text",
        filename: "valid.txt",
        contentPath: validPath,
      });

      const invalidResource = await storage.rawResources.create({
        type: "text",
        filename: "invalid.txt",
        contentPath: join(testRawDir, "documents", "non-existent.txt"),
      });

      const result = await ingestUnprocessedResources({ wikiFileManager: getTestWikiManager() });

      expect(result.total).toBe(2);
      expect(result.processed.length).toBe(1);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0].rawResourceId).toBe(invalidResource.id);
      expect(result.failed[0].error).toContain("Content file not found");
    });

    it("should return empty result when no unprocessed resources", async () => {
      const result = await ingestUnprocessedResources({ wikiFileManager: getTestWikiManager() });

      expect(result.total).toBe(0);
      expect(result.processed.length).toBe(0);
      expect(result.failed.length).toBe(0);
    });

    it("should limit processing to 50 resources", async () => {
      for (let i = 0; i < 55; i++) {
        const content = `Content for resource ${i}.`;
        const contentPath = createRawContentFile(`resource-${i}.txt`, content);
        await storage.rawResources.create({
          type: "text",
          filename: `resource-${i}.txt`,
          contentPath,
        });
      }

      const result = await ingestUnprocessedResources({ wikiFileManager: getTestWikiManager() });

      expect(result.total).toBe(50);
      expect(result.processed.length).toBe(50);
    });

    it("should pass custom options to each ingestion", async () => {
      const content = "Custom type content.";
      const contentPath = createRawContentFile("custom-type.txt", content);
      const raw = await storage.rawResources.create({
        type: "text",
        filename: "custom-type.txt",
        contentPath,
      });

      const result = await ingestUnprocessedResources({ 
        type: "entity", 
        wikiFileManager: getTestWikiManager() 
      });

      const wikiPage = await storage.wikiPages.findBySlug(result.processed[0].slug);
      expect(wikiPage?.type).toBe("entity");
    });
  });

  describe("reingestRawResource", () => {
    it("should re-ingest a previously processed resource", async () => {
      const content = "Original content for re-ingestion test.";
      const contentPath = createRawContentFile("reingest-original.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "reingest-original.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const updated = await storage.rawResources.update(rawResource.id, { processed: true });
      expect(updated?.processed).toBe(true);

      const result = await reingestRawResource(rawResource.id, { wikiFileManager: getTestWikiManager() });

      expect(result.processed).toBe(true);

      const logs = await storage.processingLog.findByRawResourceId(rawResource.id);
      expect(logs.length).toBe(2);
    });

    it("should throw error for non-existent resource", async () => {
      await expect(
        reingestRawResource("non-existent-id")
      ).rejects.toThrow("Raw resource not found");
    });

    it("should allow updating with new options during re-ingestion", async () => {
      const content = "Content that will be re-ingested with new options.";
      const contentPath = createRawContentFile("reingest-options.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "reingest-options.txt",
        contentPath,
      });

      await ingestRawResource({
        rawResourceId: rawResource.id,
        title: "Original Title",
        type: "concept",
        wikiFileManager: getTestWikiManager(),
      });

      await storage.rawResources.update(rawResource.id, { processed: false });

      const result = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: "Updated Title",
        type: "summary",
        autoProcess: true,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.title).toBe("Updated Title");
      expect(result.type).toBe("summary");
    });
  });

  describe("Wiki Page Content Generation", () => {
    it("should create wiki page with proper frontmatter", async () => {
      const content = "Test content for frontmatter validation.";
      const contentPath = createRawContentFile("frontmatter-test.txt", content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "frontmatter-test.txt",
        contentPath,
      });

      await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      const wikiPage = await storage.wikiPages.findBySlug("frontmatter-test");
      const pageContent = getTestWikiManager().readPage("concept", "frontmatter-test");

      expect(pageContent?.title).toBe("Frontmatter Test");
      expect(pageContent?.type).toBe("concept");
      expect(pageContent?.slug).toBe("frontmatter-test");
      expect(pageContent?.sourceIds).toContain(rawResource.id);
      expect(pageContent?.createdAt).toBeDefined();
      expect(pageContent?.updatedAt).toBeDefined();
    });

    it("should handle PDF type raw resources", async () => {
      const content = "PDF document content about system architecture.";
      const contentPath = createRawContentFile("architecture.pdf", content);

      const rawResource = await storage.rawResources.create({
        type: "pdf",
        filename: "architecture.pdf",
        contentPath,
      });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.type).toBe("source");
    });

    it("should handle image type raw resources", async () => {
      const content = "Image description or OCR content.";
      const contentPath = createRawContentFile("diagram.png", content);

      const rawResource = await storage.rawResources.create({
        type: "image",
        filename: "diagram.png",
        contentPath,
      });

      const result = await ingestRawResource({ 
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
      });

      expect(result.type).toBe("source");
    });
  });
});
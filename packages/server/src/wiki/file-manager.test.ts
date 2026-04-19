import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { WikiFileManager } from "./file-manager.js";
import type { WikiPageContent, LogEntry } from "./file-manager.js";

let testDir: string;
let wikiManager: WikiFileManager;

beforeEach(() => {
  testDir = join(tmpdir(), `sibyl-wiki-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  wikiManager = new WikiFileManager(testDir);
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

describe("WikiFileManager", () => {
  describe("Wiki structure initialization", () => {
    it("should create wiki directory structure on initialization", () => {
      expect(existsSync(wikiManager.getWikiDir())).toBe(true);
      expect(existsSync(join(wikiManager.getWikiDir(), "entities"))).toBe(true);
      expect(existsSync(join(wikiManager.getWikiDir(), "concepts"))).toBe(true);
      expect(existsSync(join(wikiManager.getWikiDir(), "sources"))).toBe(true);
      expect(existsSync(join(wikiManager.getWikiDir(), "summaries"))).toBe(true);
    });

    it("should create empty index.md on initialization", () => {
      expect(existsSync(wikiManager.getIndexPath())).toBe(true);
      
      const content = readFileSync(wikiManager.getIndexPath(), "utf-8");
      expect(content).toContain("# Wiki Index");
      expect(content).toContain("## Entities");
      expect(content).toContain("## Concepts");
      expect(content).toContain("## Sources");
      expect(content).toContain("## Summaries");
    });

    it("should create empty log.md on initialization", () => {
      expect(existsSync(wikiManager.getLogPath())).toBe(true);
      
      const content = readFileSync(wikiManager.getLogPath(), "utf-8");
      expect(content).toContain("# Processing Log");
    });
  });

  describe("Wiki page CRUD operations", () => {
    it("should create a wiki page with frontmatter", () => {
      const page: WikiPageContent = {
        title: "Test Concept",
        type: "concept",
        slug: "test-concept",
        content: "This is a test concept page.",
        tags: ["test", "example"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.createPage(page);

      const path = wikiManager.getPagePath("concept", "test-concept");
      expect(existsSync(path)).toBe(true);

      const fileContent = readFileSync(path, "utf-8");
      expect(fileContent).toContain("title: Test Concept");
      expect(fileContent).toContain("type: concept");
      expect(fileContent).toContain("This is a test concept page.");
    });

    it("should create a wiki page with summary", () => {
      const page: WikiPageContent = {
        title: "Python Programming",
        type: "concept",
        slug: "python",
        summary: "A popular programming language",
        content: "Python is a versatile programming language.",
        tags: ["programming", "language"],
        sourceIds: ["src-1"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.createPage(page);

      const readPage = wikiManager.readPage("concept", "python");
      expect(readPage).not.toBeNull();
      expect(readPage?.title).toBe("Python Programming");
      expect(readPage?.summary).toBe("A popular programming language");
      expect(readPage?.tags).toEqual(["programming", "language"]);
      expect(readPage?.sourceIds).toEqual(["src-1"]);
    });

    it("should read a wiki page", () => {
      const page: WikiPageContent = {
        title: "John Doe",
        type: "entity",
        slug: "john-doe",
        content: "John Doe is a software developer.",
        tags: ["person"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.createPage(page);

      const read = wikiManager.readPage("entity", "john-doe");

      expect(read).not.toBeNull();
      expect(read?.title).toBe("John Doe");
      expect(read?.type).toBe("entity");
      expect(read?.slug).toBe("john-doe");
      expect(read?.content).toBe("John Doe is a software developer.");
      expect(read?.tags).toEqual(["person"]);
    });

    it("should return null for non-existent page", () => {
      const read = wikiManager.readPage("concept", "non-existent");
      expect(read).toBeNull();
    });

    it("should update a wiki page", () => {
      const page: WikiPageContent = {
        title: "Original Title",
        type: "concept",
        slug: "update-test",
        content: "Original content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.createPage(page);

      const original = wikiManager.readPage("concept", "update-test");
      expect(original?.createdAt).toBeDefined();

      const updatedPage: WikiPageContent = {
        title: "Updated Title",
        type: "concept",
        slug: "update-test",
        summary: "New summary",
        content: "Updated content",
        tags: ["updated"],
        sourceIds: ["src-1"],
        createdAt: original!.createdAt,
        updatedAt: Date.now(),
      };

      wikiManager.updatePage(updatedPage);

      const read = wikiManager.readPage("concept", "update-test");
      expect(read?.title).toBe("Updated Title");
      expect(read?.summary).toBe("New summary");
      expect(read?.content).toBe("Updated content");
      expect(read?.tags).toEqual(["updated"]);
      expect(read?.createdAt).toBe(original!.createdAt);
    });

    it("should create new page if updating non-existent page", () => {
      const page: WikiPageContent = {
        title: "Created via update",
        type: "concept",
        slug: "created-via-update",
        content: "This was created via update",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.updatePage(page);

      const read = wikiManager.readPage("concept", "created-via-update");
      expect(read).not.toBeNull();
      expect(read?.title).toBe("Created via update");
    });

    it("should delete a wiki page", () => {
      const page: WikiPageContent = {
        title: "Delete Test",
        type: "concept",
        slug: "delete-test",
        content: "To be deleted",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      wikiManager.createPage(page);

      const deleted = wikiManager.deletePage("concept", "delete-test");
      expect(deleted).toBe(true);

      const read = wikiManager.readPage("concept", "delete-test");
      expect(read).toBeNull();
    });

    it("should return false when deleting non-existent page", () => {
      const deleted = wikiManager.deletePage("concept", "non-existent");
      expect(deleted).toBe(false);
    });

    it("should list all pages", () => {
      wikiManager.createPage({
        title: "Concept 1",
        type: "concept",
        slug: "concept-1",
        content: "Content 1",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Entity 1",
        type: "entity",
        slug: "entity-1",
        content: "Content 2",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const allPages = wikiManager.listPages();
      expect(allPages.length).toBe(2);
      expect(allPages).toContain("concept-1");
      expect(allPages).toContain("entity-1");
    });

    it("should list pages by type", () => {
      wikiManager.createPage({
        title: "Concept A",
        type: "concept",
        slug: "concept-a",
        content: "Content A",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Entity B",
        type: "entity",
        slug: "entity-b",
        content: "Content B",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const concepts = wikiManager.listPages("concept");
      expect(concepts.length).toBe(1);
      expect(concepts).toContain("concept-a");
      expect(concepts).not.toContain("entity-b");
    });
  });

  describe("Index management", () => {
    it("should add page to index when created", () => {
      wikiManager.createPage({
        title: "Indexed Concept",
        type: "concept",
        slug: "indexed-concept",
        summary: "A concept with index entry",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const index = wikiManager.getIndex();
      expect(index.length).toBe(1);
      expect(index[0]?.slug).toBe("indexed-concept");
      expect(index[0]?.title).toBe("Indexed Concept");
      expect(index[0]?.summary).toBe("A concept with index entry");
    });

    it("should update index entry when page is updated", () => {
      wikiManager.createPage({
        title: "Original",
        type: "concept",
        slug: "index-update",
        content: "Original content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const original = wikiManager.readPage("concept", "index-update");

      wikiManager.updatePage({
        title: "Updated Title",
        type: "concept",
        slug: "index-update",
        summary: "New summary for index",
        content: "Updated content",
        tags: [],
        sourceIds: [],
        createdAt: original!.createdAt,
        updatedAt: Date.now(),
      });

      const index = wikiManager.getIndex();
      const entry = index.find((e) => e.slug === "index-update");
      expect(entry?.title).toBe("Updated Title");
      expect(entry?.summary).toBe("New summary for index");
    });

    it("should remove page from index when deleted", () => {
      wikiManager.createPage({
        title: "To Delete",
        type: "concept",
        slug: "index-delete",
        content: "Will be deleted",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.deletePage("concept", "index-delete");

      const index = wikiManager.getIndex();
      expect(index.find((e) => e.slug === "index-delete")).toBeUndefined();
    });

    it("should organize index by type sections", () => {
      wikiManager.createPage({
        title: "Entity X",
        type: "entity",
        slug: "entity-x",
        content: "Entity content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Concept Y",
        type: "concept",
        slug: "concept-y",
        content: "Concept content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const indexContent = readFileSync(wikiManager.getIndexPath(), "utf-8");
      expect(indexContent).toContain("## Entities");
      expect(indexContent).toContain("## Concepts");
      expect(indexContent).toContain("- [Entity X](entities/entity-x.md)");
      expect(indexContent).toContain("- [Concept Y](concepts/concept-y.md)");
    });

    it("should rebuild index from existing pages", () => {
      wikiManager.createPage({
        title: "Page 1",
        type: "concept",
        slug: "page-1",
        summary: "Summary 1",
        content: "Content 1",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Page 2",
        type: "entity",
        slug: "page-2",
        summary: "Summary 2",
        content: "Content 2",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const index = wikiManager.getIndex();
      expect(index.length).toBe(2);

      wikiManager.rebuildIndex();

      const rebuiltIndex = wikiManager.getIndex();
      expect(rebuiltIndex.length).toBe(2);
    });
  });

  describe("Log management", () => {
    it("should append entry to log", () => {
      const entry: LogEntry = {
        timestamp: "2026-04-19",
        operation: "ingest",
        title: "Test Document",
        details: "Processed successfully",
      };

      wikiManager.appendToLog(entry);

      const logContent = readFileSync(wikiManager.getLogPath(), "utf-8");
      expect(logContent).toContain("## [2026-04-19] ingest | Test Document");
      expect(logContent).toContain("Processed successfully");
    });

    it("should read log entries", () => {
      wikiManager.appendToLog({
        timestamp: "2026-04-18",
        operation: "ingest",
        title: "Document A",
      });

      wikiManager.appendToLog({
        timestamp: "2026-04-19",
        operation: "query",
        title: "Question about X",
        details: "Answered with references",
      });

      const log = wikiManager.readLog();
      expect(log.length).toBe(2);
      expect(log[0]?.operation).toBe("ingest");
      expect(log[1]?.operation).toBe("query");
    });

    it("should limit log entries", () => {
      for (let i = 0; i < 10; i++) {
        wikiManager.appendToLog({
          timestamp: `2026-04-${10 + i}`,
          operation: "ingest",
          title: `Document ${i}`,
        });
      }

      const recent = wikiManager.readLog(3);
      expect(recent.length).toBe(3);
    });

    it("should use current date when timestamp not provided", () => {
      wikiManager.appendToLog({
        operation: "lint",
        title: "Wiki health check",
      });

      const log = wikiManager.readLog();
      const today = new Date().toISOString().split("T")[0];
      expect(log[0]?.timestamp).toBe(today);
    });
  });

  describe("Path helpers", () => {
    it("should return correct page path for each type", () => {
      expect(wikiManager.getPagePath("entity", "test")).toContain("entities/test.md");
      expect(wikiManager.getPagePath("concept", "test")).toContain("concepts/test.md");
      expect(wikiManager.getPagePath("source", "test")).toContain("sources/test.md");
      expect(wikiManager.getPagePath("summary", "test")).toContain("summaries/test.md");
    });
  });
});
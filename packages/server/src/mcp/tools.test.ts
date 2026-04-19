import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-mcp-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  
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

async function recallMemory(query: string, type?: string, limit?: number) {
  const pages = await storage.wikiPages.findAll({
    search: query,
    type: type as "entity" | "concept" | "source" | "summary" | undefined,
    limit: limit || 5,
  });

  if (pages.length === 0) {
    return { content: [{ type: "text", text: "No memories found matching the query." }] };
  }

  const results = pages.map((page) => {
    const content = wikiManager.readPage(page.type, page.slug);
    return {
      slug: page.slug,
      title: page.title,
      type: page.type,
      summary: page.summary,
      content: content?.content || "",
      tags: page.tags,
      updatedAt: page.updatedAt,
    };
  });

  return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
}

async function saveMemory(
  title: string,
  type: string,
  content: string,
  summary?: string,
  tags?: string[],
  sourceIds?: string[]
) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const existing = await storage.wikiPages.findBySlug(slug);
  const now = Date.now();

  const wikiPageContent = {
    title,
    type: type as "entity" | "concept" | "source" | "summary",
    slug,
    content,
    summary,
    tags: tags || [],
    sourceIds: sourceIds || [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (existing) {
    wikiManager.updatePage(wikiPageContent);
    await storage.wikiPages.update(existing.id, {
      title,
      summary,
      tags: tags || [],
      sourceIds: sourceIds || [],
    });
  } else {
    wikiManager.createPage(wikiPageContent);
    const dbPage = await storage.wikiPages.create({
      slug,
      title,
      type: type as "entity" | "concept" | "source" | "summary",
      contentPath: wikiManager.getPagePath(type as "entity" | "concept" | "source" | "summary", slug),
      summary,
      tags: tags || [],
      sourceIds: sourceIds || [],
    });

    await storage.processingLog.create({
      operation: "ingest",
      wikiPageId: dbPage.id,
      details: { title, type, slug },
    });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          slug,
          title,
          type,
          message: existing ? "Memory updated successfully" : "Memory created successfully",
        }),
      },
    ],
  };
}

async function listMemories(type?: string) {
  const index = wikiManager.getIndex();
  const filtered = type ? index.filter((entry) => entry.type === type) : index;
  return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
}

async function deleteMemory(slug: string, type: string) {
  const existing = await storage.wikiPages.findBySlug(slug);

  if (!existing) {
    return {
      content: [{ type: "text", text: JSON.stringify({ success: false, error: "Memory not found" }) }],
    };
  }

  wikiManager.deletePage(type as "entity" | "concept" | "source" | "summary", slug);
  await storage.wikiPages.delete(existing.id);

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, slug, message: "Memory deleted successfully" }) }],
  };
}

async function getLog(limit?: number, operation?: string) {
  if (operation) {
    const logs = await storage.processingLog.findByOperation(operation as "ingest" | "query" | "filing" | "lint");
    return { content: [{ type: "text", text: JSON.stringify(logs.slice(0, limit || 10), null, 2) }] };
  }

  const logs = await storage.processingLog.recent(limit || 10);
  return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
}

async function saveRawResource(
  type: string,
  filename: string,
  content: string,
  sourceUrl?: string,
  metadata?: Record<string, unknown>
) {
  const slug = filename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const contentPath = `data/raw/documents/${slug}.txt`;

  const resource = await storage.rawResources.create({
    type: type as "pdf" | "image" | "webpage" | "text",
    filename,
    contentPath,
    sourceUrl,
    metadata: {
      ...metadata,
      contentPreview: content.slice(0, 500),
    },
  });

  await storage.processingLog.create({
    operation: "ingest",
    rawResourceId: resource.id,
    details: { filename, type, contentLength: content.length },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          id: resource.id,
          filename,
          type,
          message: "Raw resource saved successfully",
        }),
      },
    ],
  };
}

describe("MCP Tools Logic", () => {
  describe("memory_recall", () => {
    it("should return empty result when no memories exist", async () => {
      const result = await recallMemory("test");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      const text = result.content[0].text as string;
      expect(text).toContain("No memories found");
    });

    it("should find memories matching query", async () => {
      await storage.wikiPages.create({
        slug: "python-programming",
        title: "Python Programming",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/python-programming.md"),
        summary: "A popular programming language",
        tags: ["programming", "language"],
      });

      wikiManager.createPage({
        title: "Python Programming",
        type: "concept",
        slug: "python-programming",
        content: "Python is a versatile programming language used for web development.",
        tags: ["programming", "language"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await recallMemory("Python");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(1);
      expect(data[0].title).toBe("Python Programming");
      expect(data[0].slug).toBe("python-programming");
    });

    it("should filter by type", async () => {
      await storage.wikiPages.create({
        slug: "john-doe",
        title: "John Doe",
        type: "entity",
        contentPath: join(testWikiDir, "entities/john-doe.md"),
      });

      await storage.wikiPages.create({
        slug: "javascript",
        title: "JavaScript",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/javascript.md"),
      });

      wikiManager.createPage({
        title: "John Doe",
        type: "entity",
        slug: "john-doe",
        content: "John Doe is a software developer.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "JavaScript",
        type: "concept",
        slug: "javascript",
        content: "JavaScript is a web programming language.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await recallMemory("", "entity");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(1);
      expect(data[0].type).toBe("entity");
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.wikiPages.create({
          slug: `page-${i}`,
          title: `Page ${i}`,
          type: "concept",
          contentPath: join(testWikiDir, `concepts/page-${i}.md`),
        });

        wikiManager.createPage({
          title: `Page ${i}`,
          type: "concept",
          slug: `page-${i}`,
          content: `Content for page ${i}`,
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      const result = await recallMemory("Page", undefined, 3);
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(3);
    });
  });

  describe("memory_save", () => {
    it("should create a new memory page", async () => {
      const result = await saveMemory("Test Concept", "concept", "This is a test concept content.", "A brief summary", ["test", "example"]);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.slug).toBe("test-concept");
      expect(data.message).toContain("created");

      const page = await storage.wikiPages.findBySlug("test-concept");
      expect(page).not.toBeNull();
      expect(page?.title).toBe("Test Concept");
      expect(page?.type).toBe("concept");
    });

    it("should update existing memory page", async () => {
      await saveMemory("Existing Page", "concept", "Original content");

      const result = await saveMemory("Existing Page", "concept", "Updated content", "New summary");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.message).toContain("updated");

      const page = await storage.wikiPages.findBySlug("existing-page");
      expect(page?.summary).toBe("New summary");
    });

    it("should save with source IDs", async () => {
      const result = await saveMemory("Documented Concept", "concept", "Content with sources", undefined, undefined, ["src-1", "src-2"]);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);

      const page = await storage.wikiPages.findBySlug("documented-concept");
      expect(page?.sourceIds).toEqual(["src-1", "src-2"]);
    });

    it("should generate valid slug from title", async () => {
      const result = await saveMemory("This Is A Complex Title!", "concept", "Content");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.slug).toBe("this-is-a-complex-title");
    });

    it("should create processing log entry", async () => {
      await saveMemory("Logged Page", "concept", "Content");

      const logs = await storage.processingLog.findByOperation("ingest");
      const lastLog = logs.find((l) => l.details?.slug === "logged-page");
      expect(lastLog).toBeDefined();
    });
  });

  describe("memory_list", () => {
    it("should return empty list when no pages exist", async () => {
      const result = await listMemories();
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data).toHaveLength(0);
    });

    it("should list all pages", async () => {
      await storage.wikiPages.create({
        slug: "page-1",
        title: "Page 1",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/page-1.md"),
      });

      await storage.wikiPages.create({
        slug: "page-2",
        title: "Page 2",
        type: "entity",
        contentPath: join(testWikiDir, "entities/page-2.md"),
      });

      wikiManager.createPage({
        title: "Page 1",
        type: "concept",
        slug: "page-1",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Page 2",
        type: "entity",
        slug: "page-2",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await listMemories();
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(2);
    });

    it("should filter list by type", async () => {
      await storage.wikiPages.create({
        slug: "entity-1",
        title: "Entity 1",
        type: "entity",
        contentPath: join(testWikiDir, "entities/entity-1.md"),
      });

      await storage.wikiPages.create({
        slug: "concept-1",
        title: "Concept 1",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/concept-1.md"),
      });

      wikiManager.createPage({
        title: "Entity 1",
        type: "entity",
        slug: "entity-1",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Concept 1",
        type: "concept",
        slug: "concept-1",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await listMemories("entity");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(1);
      expect(data[0].type).toBe("entity");
    });
  });

  describe("memory_delete", () => {
    it("should delete existing memory", async () => {
      await storage.wikiPages.create({
        slug: "delete-test",
        title: "Delete Test",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/delete-test.md"),
      });

      wikiManager.createPage({
        title: "Delete Test",
        type: "concept",
        slug: "delete-test",
        content: "To be deleted",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await deleteMemory("delete-test", "concept");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.message).toContain("deleted");

      const page = await storage.wikiPages.findBySlug("delete-test");
      expect(page).toBeNull();
    });

    it("should return error for non-existent memory", async () => {
      const result = await deleteMemory("non-existent", "concept");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(false);
      expect(data.error).toContain("not found");
    });
  });

  describe("memory_log", () => {
    it("should return recent logs", async () => {
      await storage.processingLog.create({
        operation: "ingest",
        details: { test: 1 },
      });

      await storage.processingLog.create({
        operation: "query",
        details: { test: 2 },
      });

      const result = await getLog(10);
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(2);
    });

    it("should filter logs by operation", async () => {
      await storage.processingLog.create({
        operation: "ingest",
      });

      await storage.processingLog.create({
        operation: "lint",
      });

      const result = await getLog(10, "ingest");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.length).toBe(1);
      expect(data[0].operation).toBe("ingest");
    });
  });

  describe("memory_raw_save", () => {
    it("should save raw text resource", async () => {
      const result = await saveRawResource("text", "test-doc.txt", "This is raw text content to be processed.");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.filename).toBe("test-doc.txt");
      expect(data.type).toBe("text");

      const resource = await storage.rawResources.findById(data.id);
      expect(resource).not.toBeNull();
      expect(resource?.type).toBe("text");
      expect(resource?.processed).toBe(false);
    });

    it("should save raw resource with source URL", async () => {
      const result = await saveRawResource("webpage", "article.html", "Article content from the web", "https://example.com/article");

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);

      const resource = await storage.rawResources.findById(data.id);
      expect(resource?.sourceUrl).toBe("https://example.com/article");
    });

    it("should save raw resource with metadata", async () => {
      const result = await saveRawResource("text", "metadata-test.txt", "Content", undefined, { author: "John", category: "tech" });

      const text = result.content[0].text as string;
      const data = JSON.parse(text);

      const resource = await storage.rawResources.findById(data.id);
      expect(resource?.metadata?.author).toBe("John");
      expect(resource?.metadata?.category).toBe("tech");
    });

    it("should create processing log entry", async () => {
      await saveRawResource("text", "logged.txt", "Content");

      const logs = await storage.processingLog.findByOperation("ingest");
      const lastLog = logs[logs.length - 1];
      expect(lastLog?.details?.filename).toBe("logged.txt");
    });
  });

  describe("memory_query", () => {
    async function queryKnowledgeBase(
      question: string,
      type?: string,
      limit?: number,
      includeContent?: boolean
    ) {
      const pages = await storage.wikiPages.findAll({
        search: question,
        type: type as "entity" | "concept" | "source" | "summary" | undefined,
        limit: limit || 10,
      });

      await storage.processingLog.create({
        operation: "query",
        details: { question, type, limit, resultCount: pages.length },
      });

      if (pages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                question,
                resultCount: 0,
                message: "No relevant information found in the knowledge base.",
                pages: [],
              }),
            },
          ],
        };
      }

      const results = pages.map((page) => {
        const content = includeContent ? wikiManager.readPage(page.type, page.slug)?.content : undefined;
        return {
          slug: page.slug,
          title: page.title,
          type: page.type,
          summary: page.summary,
          content: includeContent ? content : undefined,
          tags: page.tags,
          updatedAt: page.updatedAt,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              question,
              resultCount: pages.length,
              message: `Found ${pages.length} relevant pages in the knowledge base.`,
              pages: results,
            }),
          },
        ],
      };
    }

    it("should return no results when knowledge base is empty", async () => {
      const result = await queryKnowledgeBase("empty query test");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.resultCount).toBe(0);
      expect(data.message).toContain("No relevant information");
      expect(data.pages).toHaveLength(0);
    });

    it("should find pages matching the question", async () => {
      await storage.wikiPages.create({
        slug: "python-language",
        title: "Python Programming Language",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/python-language.md"),
        summary: "Python is a high-level programming language known for its simplicity.",
        tags: ["programming", "python"],
      });

      wikiManager.createPage({
        title: "Python Programming Language",
        type: "concept",
        slug: "python-language",
        content: "Python is a versatile programming language used for web development, data science, and automation.",
        tags: ["programming", "python"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await queryKnowledgeBase("Python");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.resultCount).toBe(1);
      expect(data.pages[0].title).toBe("Python Programming Language");
      expect(data.pages[0].slug).toBe("python-language");
      expect(data.pages[0].summary).toContain("high-level programming language");
    });

    it("should filter by type", async () => {
      await storage.wikiPages.create({
        slug: "john-developer",
        title: "John the Developer",
        type: "entity",
        contentPath: join(testWikiDir, "entities/john-developer.md"),
        summary: "A software developer who works with Python.",
      });

      await storage.wikiPages.create({
        slug: "python-concept",
        title: "Python Concept",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/python-concept.md"),
        summary: "A programming language.",
      });

      wikiManager.createPage({
        title: "John the Developer",
        type: "entity",
        slug: "john-developer",
        content: "John is a developer.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      wikiManager.createPage({
        title: "Python Concept",
        type: "concept",
        slug: "python-concept",
        content: "Python is a language.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await queryKnowledgeBase("Python", "concept");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.pages.length).toBe(1);
      expect(data.pages[0].type).toBe("concept");
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 15; i++) {
        await storage.wikiPages.create({
          slug: `python-topic-${i}`,
          title: `Python Topic ${i}`,
          type: "concept",
          contentPath: join(testWikiDir, `concepts/python-topic-${i}.md`),
          summary: `Information about Python topic ${i}`,
        });

        wikiManager.createPage({
          title: `Python Topic ${i}`,
          type: "concept",
          slug: `python-topic-${i}`,
          content: `Content for topic ${i}`,
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      const result = await queryKnowledgeBase("Python", undefined, 5);
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.pages.length).toBe(5);
    });

    it("should include full content when requested", async () => {
      await storage.wikiPages.create({
        slug: "detailed-topic",
        title: "Detailed Topic",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/detailed-topic.md"),
        summary: "A brief summary",
      });

      wikiManager.createPage({
        title: "Detailed Topic",
        type: "concept",
        slug: "detailed-topic",
        content: "This is the full content of the wiki page with detailed information.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await queryKnowledgeBase("Detailed", undefined, undefined, true);
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.pages[0].content).toContain("full content of the wiki page");
    });

    it("should not include content by default", async () => {
      await storage.wikiPages.create({
        slug: "no-content-test",
        title: "No Content Test",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/no-content-test.md"),
      });

      wikiManager.createPage({
        title: "No Content Test",
        type: "concept",
        slug: "no-content-test",
        content: "Hidden content that should not be returned.",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await queryKnowledgeBase("Content");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.pages[0].content).toBeUndefined();
    });

    it("should create processing log entry", async () => {
      await storage.wikiPages.create({
        slug: "log-test-page",
        title: "Log Test Page",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/log-test-page.md"),
      });

      wikiManager.createPage({
        title: "Log Test Page",
        type: "concept",
        slug: "log-test-page",
        content: "Content",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await queryKnowledgeBase("Log Test");

      const logs = await storage.processingLog.findByOperation("query");
      const queryLog = logs.find((l) => l.details?.question === "Log Test");
      expect(queryLog).toBeDefined();
      expect(queryLog?.details?.resultCount).toBe(1);
    });

    it("should return page tags in results", async () => {
      await storage.wikiPages.create({
        slug: "tagged-page",
        title: "Tagged Page",
        type: "concept",
        contentPath: join(testWikiDir, "concepts/tagged-page.md"),
        tags: ["important", "reference", "tutorial"],
      });

      wikiManager.createPage({
        title: "Tagged Page",
        type: "concept",
        slug: "tagged-page",
        content: "Content",
        tags: ["important", "reference", "tutorial"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const result = await queryKnowledgeBase("Tagged");
      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.pages[0].tags).toContain("important");
      expect(data.pages[0].tags).toContain("reference");
      expect(data.pages[0].tags).toContain("tutorial");
    });
  });

  describe("memory_ingest", () => {
    async function ingestContent(
      filename: string,
      content: string,
      title?: string,
      type?: string,
      tags?: string[],
      wikiManager?: WikiFileManager
    ) {
      const { writeFileSync, existsSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { ingestRawResource } = await import("../processors/ingest.js");

      const slug = filename
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const tempDir = join(tmpdir(), "sibyl-mcp-test-ingest");
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const contentPath = join(tempDir, `${slug}.txt`);
      writeFileSync(contentPath, content);

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename,
        contentPath,
        metadata: {
          title,
          tags,
          contentLength: content.length,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title,
        type: type as "entity" | "concept" | "source" | "summary" | undefined,
        tags,
        wikiFileManager: wikiManager,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              rawResourceId: ingestResult.rawResourceId,
              wikiPageId: ingestResult.wikiPageId,
              slug: ingestResult.slug,
              title: ingestResult.title,
              type: ingestResult.type,
              processed: ingestResult.processed,
              message: "Content ingested and wiki page created successfully",
            }),
          },
        ],
      };
    }

    it("should ingest content and create wiki page", async () => {
      const result = await ingestContent("test-doc.txt", "This is test content for ingestion.", undefined, undefined, undefined, wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);
      expect(data.slug).toBe("test-doc");
      expect(data.processed).toBe(true);

      const page = await storage.wikiPages.findBySlug("test-doc");
      expect(page).not.toBeNull();
      expect(page?.title).toBe("Test Doc");
    });

    it("should ingest content with custom title", async () => {
      const result = await ingestContent("custom.txt", "Content here", "Custom Wiki Title", undefined, undefined, wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.title).toBe("Custom Wiki Title");
      expect(data.slug).toBe("custom-wiki-title");

      const page = await storage.wikiPages.findBySlug("custom-wiki-title");
      expect(page?.title).toBe("Custom Wiki Title");
    });

    it("should ingest content with specific type", async () => {
      const result = await ingestContent("entity-doc.txt", "Entity content", undefined, "entity", undefined, wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.type).toBe("entity");

      const page = await storage.wikiPages.findBySlug("entity-doc");
      expect(page?.type).toBe("entity");
    });

    it("should ingest content with tags", async () => {
      const result = await ingestContent("tagged.txt", "Tagged content", undefined, undefined, ["test", "example", "demo"], wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.success).toBe(true);

      const page = await storage.wikiPages.findBySlug("tagged");
      expect(page?.tags).toContain("test");
      expect(page?.tags).toContain("example");
      expect(page?.tags).toContain("demo");
    });

    it("should mark raw resource as processed", async () => {
      const result = await ingestContent("processed-check.txt", "Content for processing check", undefined, undefined, undefined, wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);

      const resource = await storage.rawResources.findById(data.rawResourceId);
      expect(resource?.processed).toBe(true);
    });

    it("should create wiki page content on disk", async () => {
      await ingestContent("disk-content.txt", "This content should be written to disk.", undefined, undefined, undefined, wikiManager);

      const page = await storage.wikiPages.findBySlug("disk-content");
      const pageContent = wikiManager.readPage(page?.type || "concept", "disk-content");
      expect(pageContent?.content).toContain("This content should be written to disk");
    });

    it("should create processing log entries", async () => {
      await ingestContent("logged-ingest.txt", "Logged content", undefined, undefined, undefined, wikiManager);

      const logs = await storage.processingLog.findByOperation("ingest");
      const ingestLog = logs.find((l) => l.details?.slug === "logged-ingest");
      expect(ingestLog).toBeDefined();
      expect(ingestLog?.details?.action).toBe("created");
    });

    it("should update existing page when ingesting same content", async () => {
      await ingestContent("update-test.txt", "Original content", "Update Test", undefined, undefined, wikiManager);

      const firstPage = await storage.wikiPages.findBySlug("update-test");
      expect(firstPage).not.toBeNull();

      await ingestContent("update-test.txt", "Updated content here", "Update Test", undefined, undefined, wikiManager);

      const updatedPage = await storage.wikiPages.findBySlug("update-test");
      expect(updatedPage?.updatedAt).toBeGreaterThan(firstPage?.updatedAt || 0);
    });

    it("should handle complex filename for slug generation", async () => {
      const result = await ingestContent("My Complex File Name!@#.txt", "Content", undefined, undefined, undefined, wikiManager);

      const text = result.content[0].text as string;
      const data = JSON.parse(text);
      expect(data.slug).toBe("my-complex-file-name");
    });
  });
});
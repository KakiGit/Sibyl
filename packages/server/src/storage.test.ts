import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createDatabase,
  closeDatabase,
  setDatabase,
  migrateDatabase,
  storage,
} from "../src/index.js";

let testDbPath: string;
let testDbDir: string;

beforeEach(() => {
  testDbDir = join(tmpdir(), `sibyl-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);
});

afterEach(() => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

describe("RawResourceStorage", () => {
  it("should create a raw resource", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    expect(resource.id).toBeDefined();
    expect(resource.type).toBe("text");
    expect(resource.filename).toBe("test.txt");
    expect(resource.contentPath).toBe("/data/raw/documents/test.txt");
    expect(resource.processed).toBe(false);
    expect(resource.createdAt).toBeDefined();
  });

  it("should create a raw resource with metadata", async () => {
    const metadata = { author: "John Doe", pages: 42 };
    const resource = await storage.rawResources.create({
      type: "pdf",
      filename: "document.pdf",
      contentPath: "/data/raw/documents/document.pdf",
      sourceUrl: "https://example.com/document.pdf",
      metadata,
    });

    expect(resource.metadata).toEqual(metadata);
    expect(resource.sourceUrl).toBe("https://example.com/document.pdf");
  });

  it("should find a raw resource by id", async () => {
    const created = await storage.rawResources.create({
      type: "webpage",
      filename: "article.html",
      contentPath: "/data/raw/webpages/article.html",
    });

    const found = await storage.rawResources.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.type).toBe("webpage");
  });

  it("should return null for non-existent id", async () => {
    const found = await storage.rawResources.findById("non-existent-id");
    expect(found).toBeNull();
  });

  it("should find all raw resources", async () => {
    await storage.rawResources.create({
      type: "text",
      filename: "test1.txt",
      contentPath: "/data/raw/documents/test1.txt",
    });

    await storage.rawResources.create({
      type: "pdf",
      filename: "test2.pdf",
      contentPath: "/data/raw/documents/test2.pdf",
    });

    const all = await storage.rawResources.findAll();

    expect(all.length).toBe(2);
  });

  it("should filter raw resources by type", async () => {
    await storage.rawResources.create({
      type: "text",
      filename: "test1.txt",
      contentPath: "/data/raw/documents/test1.txt",
    });

    await storage.rawResources.create({
      type: "pdf",
      filename: "test2.pdf",
      contentPath: "/data/raw/documents/test2.pdf",
    });

    const textResources = await storage.rawResources.findAll({ type: "text" });

    expect(textResources.length).toBe(1);
    expect(textResources[0]?.type).toBe("text");
  });

  it("should filter raw resources by processed status", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    await storage.rawResources.update(resource.id, { processed: true });

    const processedResources = await storage.rawResources.findAll({ processed: true });

    expect(processedResources.length).toBe(1);
    expect(processedResources[0]?.processed).toBe(true);
  });

  it("should update a raw resource", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    const updated = await storage.rawResources.update(resource.id, {
      processed: true,
      metadata: { processedAt: Date.now() },
    });

    expect(updated).not.toBeNull();
    expect(updated?.processed).toBe(true);
    expect(updated?.metadata?.processedAt).toBeDefined();
  });

  it("should return null when updating non-existent resource", async () => {
    const updated = await storage.rawResources.update("non-existent-id", {
      processed: true,
    });

    expect(updated).toBeNull();
  });

  it("should delete a raw resource", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    const deleted = await storage.rawResources.delete(resource.id);
    expect(deleted).toBe(true);

    const found = await storage.rawResources.findById(resource.id);
    expect(found).toBeNull();
  });

  it("should count raw resources", async () => {
    await storage.rawResources.create({
      type: "text",
      filename: "test1.txt",
      contentPath: "/data/raw/documents/test1.txt",
    });

    await storage.rawResources.create({
      type: "pdf",
      filename: "test2.pdf",
      contentPath: "/data/raw/documents/test2.pdf",
    });

    const count = await storage.rawResources.count();
    expect(count).toBe(2);

    const textCount = await storage.rawResources.count({ type: "text" });
    expect(textCount).toBe(1);
  });
});

describe("WikiPageStorage", () => {
  it("should create a wiki page", async () => {
    const page = await storage.wikiPages.create({
      slug: "test-concept",
      title: "Test Concept",
      type: "concept",
      contentPath: "/data/wiki/concepts/test-concept.md",
    });

    expect(page.id).toBeDefined();
    expect(page.slug).toBe("test-concept");
    expect(page.title).toBe("Test Concept");
    expect(page.type).toBe("concept");
    expect(page.version).toBe(1);
    expect(page.createdAt).toBeDefined();
    expect(page.updatedAt).toBeDefined();
  });

  it("should create a wiki page with tags and source ids", async () => {
    const page = await storage.wikiPages.create({
      slug: "entity-john",
      title: "John Doe",
      type: "entity",
      contentPath: "/data/wiki/entities/john-doe.md",
      summary: "A software developer",
      tags: ["person", "developer"],
      sourceIds: ["src-1", "src-2"],
    });

    expect(page.tags).toEqual(["person", "developer"]);
    expect(page.sourceIds).toEqual(["src-1", "src-2"]);
    expect(page.summary).toBe("A software developer");
  });

  it("should find a wiki page by id", async () => {
    const created = await storage.wikiPages.create({
      slug: "test",
      title: "Test",
      type: "concept",
      contentPath: "/data/wiki/concepts/test.md",
    });

    const found = await storage.wikiPages.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
  });

  it("should find a wiki page by slug", async () => {
    await storage.wikiPages.create({
      slug: "unique-slug",
      title: "Unique Page",
      type: "concept",
      contentPath: "/data/wiki/concepts/unique.md",
    });

    const found = await storage.wikiPages.findBySlug("unique-slug");

    expect(found).not.toBeNull();
    expect(found?.title).toBe("Unique Page");
  });

  it("should find all wiki pages", async () => {
    await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/data/wiki/concepts/page-1.md",
    });

    await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "entity",
      contentPath: "/data/wiki/entities/page-2.md",
    });

    const all = await storage.wikiPages.findAll();

    expect(all.length).toBe(2);
  });

  it("should filter wiki pages by type", async () => {
    await storage.wikiPages.create({
      slug: "concept-1",
      title: "Concept 1",
      type: "concept",
      contentPath: "/data/wiki/concepts/concept-1.md",
    });

    await storage.wikiPages.create({
      slug: "entity-1",
      title: "Entity 1",
      type: "entity",
      contentPath: "/data/wiki/entities/entity-1.md",
    });

    const concepts = await storage.wikiPages.findAll({ type: "concept" });

    expect(concepts.length).toBe(1);
    expect(concepts[0]?.type).toBe("concept");
  });

  it("should search wiki pages by title and summary", async () => {
    await storage.wikiPages.create({
      slug: "python",
      title: "Python Programming",
      type: "concept",
      contentPath: "/data/wiki/concepts/python.md",
      summary: "A popular programming language",
    });

    await storage.wikiPages.create({
      slug: "javascript",
      title: "JavaScript Guide",
      type: "concept",
      contentPath: "/data/wiki/concepts/javascript.md",
      summary: "Web programming essentials",
    });

    const results = await storage.wikiPages.findAll({ search: "Python" });

    expect(results.length).toBe(1);
    expect(results[0]?.title).toBe("Python Programming");
  });

  it("should filter wiki pages by tags", async () => {
    await storage.wikiPages.create({
      slug: "page-a",
      title: "Page A",
      type: "concept",
      contentPath: "/data/wiki/concepts/page-a.md",
      tags: ["programming", "python"],
    });

    await storage.wikiPages.create({
      slug: "page-b",
      title: "Page B",
      type: "concept",
      contentPath: "/data/wiki/concepts/page-b.md",
      tags: ["programming", "javascript"],
    });

    const pythonPages = await storage.wikiPages.findAll({ tags: ["python"] });

    expect(pythonPages.length).toBe(1);
    expect(pythonPages[0]?.slug).toBe("page-a");
  });

  it("should update a wiki page", async () => {
    const page = await storage.wikiPages.create({
      slug: "update-test",
      title: "Original Title",
      type: "concept",
      contentPath: "/data/wiki/concepts/update-test.md",
    });

    const updated = await storage.wikiPages.update(page.id, {
      title: "Updated Title",
      summary: "New summary",
    });

    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("Updated Title");
    expect(updated?.summary).toBe("New summary");
    expect(updated?.version).toBe(2);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(page.updatedAt);
  });

  it("should return null when updating non-existent page", async () => {
    const updated = await storage.wikiPages.update("non-existent-id", {
      title: "New Title",
    });

    expect(updated).toBeNull();
  });

  it("should delete a wiki page", async () => {
    const page = await storage.wikiPages.create({
      slug: "delete-test",
      title: "Delete Test",
      type: "concept",
      contentPath: "/data/wiki/concepts/delete-test.md",
    });

    const deleted = await storage.wikiPages.delete(page.id);
    expect(deleted).toBe(true);

    const found = await storage.wikiPages.findById(page.id);
    expect(found).toBeNull();
  });

  it("should delete associated wiki links when deleting a page", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "link-source",
      title: "Link Source",
      type: "concept",
      contentPath: "/data/wiki/concepts/link-source.md",
    });

    const page2 = await storage.wikiPages.create({
      slug: "link-target",
      title: "Link Target",
      type: "concept",
      contentPath: "/data/wiki/concepts/link-target.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    await storage.wikiPages.delete(page1.id);

    const links = await storage.wikiLinks.findByFromPageId(page1.id);
    expect(links.length).toBe(0);
  });

  it("should count wiki pages", async () => {
    await storage.wikiPages.create({
      slug: "count-1",
      title: "Count 1",
      type: "concept",
      contentPath: "/data/wiki/concepts/count-1.md",
    });

    await storage.wikiPages.create({
      slug: "count-2",
      title: "Count 2",
      type: "entity",
      contentPath: "/data/wiki/entities/count-2.md",
    });

    const count = await storage.wikiPages.count();
    expect(count).toBe(2);

    const conceptCount = await storage.wikiPages.count({ type: "concept" });
    expect(conceptCount).toBe(1);
  });
});

describe("WikiLinkStorage", () => {
  it("should create a wiki link", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "link-from",
      title: "Link From",
      type: "concept",
      contentPath: "/data/wiki/concepts/link-from.md",
    });

    const page2 = await storage.wikiPages.create({
      slug: "link-to",
      title: "Link To",
      type: "concept",
      contentPath: "/data/wiki/concepts/link-to.md",
    });

    const link = await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    expect(link.id).toBeDefined();
    expect(link.fromPageId).toBe(page1.id);
    expect(link.toPageId).toBe(page2.id);
    expect(link.relationType).toBe("references");
  });

  it("should find links by from page id", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "source",
      title: "Source",
      type: "concept",
      contentPath: "/data/wiki/concepts/source.md",
    });

    const page2 = await storage.wikiPages.create({
      slug: "target",
      title: "Target",
      type: "concept",
      contentPath: "/data/wiki/concepts/target.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const links = await storage.wikiLinks.findByFromPageId(page1.id);

    expect(links.length).toBe(1);
    expect(links[0]?.toPageId).toBe(page2.id);
  });

  it("should find links by to page id", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "source2",
      title: "Source 2",
      type: "concept",
      contentPath: "/data/wiki/concepts/source2.md",
    });

    const page2 = await storage.wikiPages.create({
      slug: "target2",
      title: "Target 2",
      type: "concept",
      contentPath: "/data/wiki/concepts/target2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "cites",
    });

    const links = await storage.wikiLinks.findByToPageId(page2.id);

    expect(links.length).toBe(1);
    expect(links[0]?.fromPageId).toBe(page1.id);
  });

  it("should delete a wiki link", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "delete-source",
      title: "Delete Source",
      type: "concept",
      contentPath: "/data/wiki/concepts/delete-source.md",
    });

    const page2 = await storage.wikiPages.create({
      slug: "delete-target",
      title: "Delete Target",
      type: "concept",
      contentPath: "/data/wiki/concepts/delete-target.md",
    });

    const link = await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    await storage.wikiLinks.delete(link.id);

    const links = await storage.wikiLinks.findByFromPageId(page1.id);
    expect(links.length).toBe(0);
  });
});

describe("ProcessingLogStorage", () => {
  it("should create a processing log", async () => {
    const log = await storage.processingLog.create({
      operation: "ingest",
      details: { filename: "test.txt" },
    });

    expect(log.id).toBeDefined();
    expect(log.operation).toBe("ingest");
    expect(log.details).toEqual({ filename: "test.txt" });
  });

  it("should create a processing log with resource and page references", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    const page = await storage.wikiPages.create({
      slug: "log-test",
      title: "Log Test",
      type: "source",
      contentPath: "/data/wiki/sources/log-test.md",
    });

    const log = await storage.processingLog.create({
      operation: "filing",
      rawResourceId: resource.id,
      wikiPageId: page.id,
    });

    expect(log.rawResourceId).toBe(resource.id);
    expect(log.wikiPageId).toBe(page.id);
  });

  it("should find logs by operation", async () => {
    await storage.processingLog.create({ operation: "ingest" });
    await storage.processingLog.create({ operation: "query" });
    await storage.processingLog.create({ operation: "ingest" });

    const ingestLogs = await storage.processingLog.findByOperation("ingest");

    expect(ingestLogs.length).toBe(2);
  });

  it("should find logs by raw resource id", async () => {
    const resource = await storage.rawResources.create({
      type: "text",
      filename: "test.txt",
      contentPath: "/data/raw/documents/test.txt",
    });

    await storage.processingLog.create({
      operation: "ingest",
      rawResourceId: resource.id,
    });

    const logs = await storage.processingLog.findByRawResourceId(resource.id);

    expect(logs.length).toBe(1);
    expect(logs[0]?.rawResourceId).toBe(resource.id);
  });

  it("should get recent logs", async () => {
    await storage.processingLog.create({ operation: "ingest" });
    await storage.processingLog.create({ operation: "query" });
    await storage.processingLog.create({ operation: "lint" });

    const recent = await storage.processingLog.recent(2);

    expect(recent.length).toBe(2);
  });
});

describe("EmbeddingCacheStorage", () => {
  it("should create an embedding cache", async () => {
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    const cache = await storage.embeddingsCache.create(
      "hash123",
      embedding,
      "test-model"
    );

    expect(cache.id).toBeDefined();
    expect(cache.contentHash).toBe("hash123");
    expect(cache.embedding).toEqual(embedding);
    expect(cache.model).toBe("test-model");
  });

  it("should find embedding by content hash", async () => {
    const embedding = [0.5, 0.4, 0.3, 0.2, 0.1];
    await storage.embeddingsCache.create("unique-hash", embedding, "model-v1");

    const found = await storage.embeddingsCache.findByContentHash("unique-hash");

    expect(found).not.toBeNull();
    expect(found?.embedding).toEqual(embedding);
  });

  it("should return null for non-existent hash", async () => {
    const found = await storage.embeddingsCache.findByContentHash("non-existent");
    expect(found).toBeNull();
  });

  it("should delete an embedding cache", async () => {
    const cache = await storage.embeddingsCache.create(
      "delete-hash",
      [0.1, 0.2],
      "model"
    );

    await storage.embeddingsCache.delete(cache.id);

    const found = await storage.embeddingsCache.findByContentHash("delete-hash");
    expect(found).toBeNull();
  });
});
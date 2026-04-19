import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createServer, closeDatabase, setDatabase, createDatabase, migrateDatabase } from "../src/index.js";

let testDbDir: string;
let testDbPath: string;
let server: Awaited<ReturnType<typeof createServer>>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-server-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);
  server = await createServer({ dbPath: testDbPath });
});

afterEach(async () => {
  await server.close();
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

describe("Health Endpoint", () => {
  it("should return health status", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

describe("Raw Resources API", () => {
  it("should create a raw resource", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBeDefined();
    expect(body.data.type).toBe("text");
    expect(body.data.filename).toBe("test.txt");
    expect(body.data.processed).toBe(false);
  });

  it("should create a raw resource with source URL and metadata", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "webpage",
        filename: "article.html",
        contentPath: "/data/raw/webpages/article.html",
        sourceUrl: "https://example.com/article",
        metadata: { author: "John Doe" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.sourceUrl).toBe("https://example.com/article");
    expect(body.data.metadata).toEqual({ author: "John Doe" });
  });

  it("should get all raw resources", async () => {
    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test1.txt",
        contentPath: "/data/raw/documents/test1.txt",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "pdf",
        filename: "test2.pdf",
        contentPath: "/data/raw/documents/test2.pdf",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/raw-resources",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(2);
  });

  it("should filter raw resources by type", async () => {
    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test1.txt",
        contentPath: "/data/raw/documents/test1.txt",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "pdf",
        filename: "test2.pdf",
        contentPath: "/data/raw/documents/test2.pdf",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/raw-resources?type=text",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].type).toBe("text");
  });

  it("should get raw resource count", async () => {
    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test1.txt",
        contentPath: "/data/raw/documents/test1.txt",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "pdf",
        filename: "test2.pdf",
        contentPath: "/data/raw/documents/test2.pdf",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/raw-resources/count",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.count).toBe(2);
  });

  it("should get a raw resource by id", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const response = await server.inject({
      method: "GET",
      url: `/api/raw-resources/${created.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBe(created.id);
  });

  it("should return 404 for non-existent raw resource", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/raw-resources/non-existent-id",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should update a raw resource", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const response = await server.inject({
      method: "PUT",
      url: `/api/raw-resources/${created.id}`,
      body: {
        processed: true,
        metadata: { processedAt: Date.now() },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.processed).toBe(true);
    expect(body.data.metadata.processedAt).toBeDefined();
  });

  it("should return 404 when updating non-existent resource", async () => {
    const response = await server.inject({
      method: "PUT",
      url: "/api/raw-resources/non-existent-id",
      body: {
        processed: true,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it("should delete a raw resource", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/raw-resources/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(200);
    const body = JSON.parse(deleteResponse.body);
    expect(body.success).toBe(true);

    const getResponse = await server.inject({
      method: "GET",
      url: `/api/raw-resources/${created.id}`,
    });

    expect(getResponse.statusCode).toBe(404);
  });

  it("should return 404 when deleting non-existent resource", async () => {
    const response = await server.inject({
      method: "DELETE",
      url: "/api/raw-resources/non-existent-id",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should validate raw resource type", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "invalid",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should validate source URL format", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "webpage",
        filename: "test.html",
        contentPath: "/data/raw/documents/test.html",
        sourceUrl: "invalid-url",
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("Wiki Pages API", () => {
  it("should create a wiki page", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "test-concept",
        title: "Test Concept",
        type: "concept",
        contentPath: "/data/wiki/concepts/test-concept.md",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBeDefined();
    expect(body.data.slug).toBe("test-concept");
    expect(body.data.title).toBe("Test Concept");
    expect(body.data.type).toBe("concept");
  });

  it("should create a wiki page with tags and source IDs", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "entity-john",
        title: "John Doe",
        type: "entity",
        contentPath: "/data/wiki/entities/john-doe.md",
        summary: "A software developer",
        tags: ["person", "developer"],
        sourceIds: ["src-1", "src-2"],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.tags).toEqual(["person", "developer"]);
    expect(body.data.sourceIds).toEqual(["src-1", "src-2"]);
  });

  it("should reject duplicate slug", async () => {
    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "duplicate-slug",
        title: "First Page",
        type: "concept",
        contentPath: "/data/wiki/concepts/duplicate.md",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "duplicate-slug",
        title: "Second Page",
        type: "entity",
        contentPath: "/data/wiki/entities/duplicate.md",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it("should get all wiki pages", async () => {
    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "page-1",
        title: "Page 1",
        type: "concept",
        contentPath: "/data/wiki/concepts/page-1.md",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "page-2",
        title: "Page 2",
        type: "entity",
        contentPath: "/data/wiki/entities/page-2.md",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/wiki-pages",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(2);
  });

  it("should filter wiki pages by type", async () => {
    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "concept-1",
        title: "Concept 1",
        type: "concept",
        contentPath: "/data/wiki/concepts/concept-1.md",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "entity-1",
        title: "Entity 1",
        type: "entity",
        contentPath: "/data/wiki/entities/entity-1.md",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/wiki-pages?type=concept",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].type).toBe("concept");
  });

  it("should search wiki pages", async () => {
    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "python",
        title: "Python Programming",
        type: "concept",
        contentPath: "/data/wiki/concepts/python.md",
        summary: "A popular language",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "javascript",
        title: "JavaScript Guide",
        type: "concept",
        contentPath: "/data/wiki/concepts/javascript.md",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/wiki-pages?search=Python",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].title).toBe("Python Programming");
  });

  it("should get wiki page by id", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "test-page",
        title: "Test Page",
        type: "concept",
        contentPath: "/data/wiki/concepts/test.md",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const response = await server.inject({
      method: "GET",
      url: `/api/wiki-pages/${created.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBe(created.id);
  });

  it("should get wiki page by slug", async () => {
    await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "unique-slug",
        title: "Unique Page",
        type: "concept",
        contentPath: "/data/wiki/concepts/unique.md",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/wiki-pages/slug/unique-slug",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.slug).toBe("unique-slug");
  });

  it("should update a wiki page", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "update-test",
        title: "Original Title",
        type: "concept",
        contentPath: "/data/wiki/concepts/update.md",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const response = await server.inject({
      method: "PUT",
      url: `/api/wiki-pages/${created.id}`,
      body: {
        title: "Updated Title",
        summary: "New summary",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.title).toBe("Updated Title");
    expect(body.data.summary).toBe("New summary");
    expect(body.data.version).toBe(2);
  });

  it("should delete a wiki page", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "delete-test",
        title: "Delete Test",
        type: "concept",
        contentPath: "/data/wiki/concepts/delete.md",
      },
    });

    const created = JSON.parse(createResponse.body).data;

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/wiki-pages/${created.id}`,
    });

    expect(deleteResponse.statusCode).toBe(200);

    const getResponse = await server.inject({
      method: "GET",
      url: `/api/wiki-pages/${created.id}`,
    });

    expect(getResponse.statusCode).toBe(404);
  });

  it("should validate wiki page slug format", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "Invalid Slug",
        title: "Test",
        type: "concept",
        contentPath: "/data/wiki/concepts/test.md",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should validate wiki page type", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "test",
        title: "Test",
        type: "invalid",
        contentPath: "/data/wiki/concepts/test.md",
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("Wiki Links API", () => {
  it("should create a wiki link", async () => {
    const page1Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "link-from",
        title: "Link From",
        type: "concept",
        contentPath: "/data/wiki/concepts/link-from.md",
      },
    });

    const page2Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "link-to",
        title: "Link To",
        type: "concept",
        contentPath: "/data/wiki/concepts/link-to.md",
      },
    });

    const page1 = JSON.parse(page1Response.body).data;
    const page2 = JSON.parse(page2Response.body).data;

    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-links",
      body: {
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "references",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.fromPageId).toBe(page1.id);
    expect(body.data.toPageId).toBe(page2.id);
    expect(body.data.relationType).toBe("references");
  });

  it("should reject link with non-existent pages", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/wiki-links",
      body: {
        fromPageId: "non-existent",
        toPageId: "non-existent",
        relationType: "references",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should get links from a page", async () => {
    const page1Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "source",
        title: "Source",
        type: "concept",
        contentPath: "/data/wiki/concepts/source.md",
      },
    });

    const page2Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "target",
        title: "Target",
        type: "concept",
        contentPath: "/data/wiki/concepts/target.md",
      },
    });

    const page1 = JSON.parse(page1Response.body).data;
    const page2 = JSON.parse(page2Response.body).data;

    await server.inject({
      method: "POST",
      url: "/api/wiki-links",
      body: {
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "references",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: `/api/wiki-links/from/${page1.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].toPageId).toBe(page2.id);
  });

  it("should get links to a page", async () => {
    const page1Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "source2",
        title: "Source 2",
        type: "concept",
        contentPath: "/data/wiki/concepts/source2.md",
      },
    });

    const page2Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "target2",
        title: "Target 2",
        type: "concept",
        contentPath: "/data/wiki/concepts/target2.md",
      },
    });

    const page1 = JSON.parse(page1Response.body).data;
    const page2 = JSON.parse(page2Response.body).data;

    await server.inject({
      method: "POST",
      url: "/api/wiki-links",
      body: {
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "cites",
      },
    });

    const response = await server.inject({
      method: "GET",
      url: `/api/wiki-links/to/${page2.id}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].fromPageId).toBe(page1.id);
  });

  it("should delete a wiki link", async () => {
    const page1Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "delete-source",
        title: "Delete Source",
        type: "concept",
        contentPath: "/data/wiki/concepts/delete-source.md",
      },
    });

    const page2Response = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "delete-target",
        title: "Delete Target",
        type: "concept",
        contentPath: "/data/wiki/concepts/delete-target.md",
      },
    });

    const page1 = JSON.parse(page1Response.body).data;
    const page2 = JSON.parse(page2Response.body).data;

    const linkResponse = await server.inject({
      method: "POST",
      url: "/api/wiki-links",
      body: {
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "references",
      },
    });

    const link = JSON.parse(linkResponse.body).data;

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/api/wiki-links/${link.id}`,
    });

    expect(deleteResponse.statusCode).toBe(200);

    const getResponse = await server.inject({
      method: "GET",
      url: `/api/wiki-links/from/${page1.id}`,
    });

    const body = JSON.parse(getResponse.body);
    expect(body.data.length).toBe(0);
  });
});

describe("Processing Log API", () => {
  it("should create a processing log", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: {
        operation: "ingest",
        details: { filename: "test.txt" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBeDefined();
    expect(body.data.operation).toBe("ingest");
    expect(body.data.details).toEqual({ filename: "test.txt" });
  });

  it("should create a log with resource and page references", async () => {
    const resourceResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "test.txt",
        contentPath: "/data/raw/documents/test.txt",
      },
    });

    const pageResponse = await server.inject({
      method: "POST",
      url: "/api/wiki-pages",
      body: {
        slug: "log-test",
        title: "Log Test",
        type: "source",
        contentPath: "/data/wiki/sources/log-test.md",
      },
    });

    const resource = JSON.parse(resourceResponse.body).data;
    const page = JSON.parse(pageResponse.body).data;

    const response = await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: {
        operation: "filing",
        rawResourceId: resource.id,
        wikiPageId: page.id,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.rawResourceId).toBe(resource.id);
    expect(body.data.wikiPageId).toBe(page.id);
  });

  it("should get recent logs", async () => {
    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "ingest" },
    });

    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "query" },
    });

    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "lint" },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/processing-log?limit=2",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(2);
  });

  it("should get logs by operation", async () => {
    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "ingest" },
    });

    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "query" },
    });

    await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "ingest" },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/processing-log?operation=ingest",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.length).toBe(2);
    expect(body.data[0].operation).toBe("ingest");
  });

  it("should validate operation type", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/processing-log",
      body: { operation: "invalid" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("Ingest API", () => {
  it("should get ingest status", async () => {
    const unprocessedResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "unprocessed.txt",
        contentPath: "/data/raw/documents/unprocessed.txt",
      },
    });

    const processedCreateResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "processed.txt",
        contentPath: "/data/raw/documents/processed.txt",
      },
    });

    const processedResourceId = JSON.parse(processedCreateResponse.body).data.id;

    await server.inject({
      method: "PUT",
      url: `/api/raw-resources/${processedResourceId}`,
      body: {
        processed: true,
      },
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/ingest/status",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.total).toBe(2);
    expect(body.data.unprocessed).toBe(1);
    expect(body.data.processed).toBe(1);
  });

  it("should ingest text content directly", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "test-document.txt",
        content: "This is a test document about machine learning algorithms. Machine learning is a subset of artificial intelligence.",
        title: "Machine Learning Basics",
        type: "concept",
        tags: ["ai", "ml"],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.rawResourceId).toBeDefined();
    expect(body.data.wikiPageId).toBeDefined();
    expect(body.data.slug).toBe("machine-learning-basics");
    expect(body.data.title).toBe("Machine Learning Basics");
    expect(body.data.type).toBe("concept");
    expect(body.data.processed).toBe(true);
  });

  it("should ingest text content with default title from filename", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "Python Guide.txt",
        content: "Python is a popular programming language known for its simplicity and readability.",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.slug).toBe("python-guide");
    expect(body.data.title).toBe("Python Guide");
    expect(body.data.type).toBe("concept");
  });

  it("should ingest text content as source type when specified", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "api-reference.txt",
        content: "API Reference documentation for the system.",
        type: "source",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.type).toBe("source");
  });

  it("should create wiki page file after ingestion", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "wiki-test.txt",
        content: "Content for wiki page creation test.",
      },
    });

    expect(response.statusCode).toBe(200);

    const wikiResponse = await server.inject({
      method: "GET",
      url: "/api/wiki-pages/slug/wiki-test",
    });

    expect(wikiResponse.statusCode).toBe(200);
    const wikiBody = JSON.parse(wikiResponse.body);
    expect(wikiBody.data.slug).toBe("wiki-test");
  });

  it("should validate required fields for text ingestion", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "",
        content: "Some content",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should validate source URL format for text ingestion", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "test.txt",
        content: "Content",
        sourceUrl: "invalid-url",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should batch ingest unprocessed resources", async () => {
    await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "batch-doc-1.txt",
        content: "First document for batch processing.",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "batch-doc-2.txt",
        content: "Second document for batch processing.",
      },
    });

    await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "batch-doc-3.txt",
        contentPath: "/data/raw/documents/batch-doc-3.txt",
      },
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/batch",
      body: {},
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.total).toBe(1);
    expect(body.data.failed.length).toBe(1);
  });

  it("should ingest single raw resource by ID", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "single-ingest.txt",
        content: "Document for single ingest test.",
      },
    });

    const rawResourceId = JSON.parse(createResponse.body).data.rawResourceId;

    const newResponse = await server.inject({
      method: "POST",
      url: "/api/raw-resources",
      body: {
        type: "text",
        filename: "single-test.txt",
        contentPath: "/data/raw/documents/single-test.txt",
      },
    });

    const newResourceId = JSON.parse(newResponse.body).data.id;

    const response = await server.inject({
      method: "POST",
      url: "/api/ingest",
      body: {
        rawResourceId: newResourceId,
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it("should validate raw resource ID for ingest", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest",
      body: {
        rawResourceId: "",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should validate wiki page type for ingest", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "test.txt",
        content: "Content",
        type: "invalid",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("should return error for non-existent raw resource", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest",
      body: {
        rawResourceId: "non-existent-id",
      },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it("should ingest text with source URL", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "webpage-content.txt",
        content: "Content scraped from webpage.",
        sourceUrl: "https://example.com/article",
        type: "source",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.type).toBe("source");
  });

  it("should reingest a processed resource", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "reingest-test.txt",
        content: "Original content for reingest test.",
      },
    });

    const rawResourceId = JSON.parse(createResponse.body).data.rawResourceId;

    const response = await server.inject({
      method: "POST",
      url: `/api/ingest/reingest/${rawResourceId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.rawResourceId).toBe(rawResourceId);
    expect(body.data.processed).toBe(true);
  });

  it("should return error when reingesting non-existent resource", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/reingest/non-existent-id",
    });

    expect(response.statusCode).toBe(500);
  });

  it("should create processing log entry after ingestion", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/ingest/text",
      body: {
        filename: "log-entry-test.txt",
        content: "Content for log entry verification.",
      },
    });

    expect(response.statusCode).toBe(200);

    const logResponse = await server.inject({
      method: "GET",
      url: "/api/processing-log?operation=ingest",
    });

    expect(logResponse.statusCode).toBe(200);
    const logBody = JSON.parse(logResponse.body);
    expect(logBody.data.length).toBeGreaterThan(0);
  });
});
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../server.js";
import { closeDatabase } from "../database.js";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import type { FastifyInstance } from "fastify";

function getUniqueSlug(): string {
  return `slug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getUniqueTestFile(dir: string, content: string): string {
  const filename = `file-${Date.now()}-${Math.random().toString(36).slice(2, 4)}.md`;
  const filePath = join(dir, filename);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content);
  return filePath;
}

function createTestMarkdown(title: string, type: string, body: string): string {
  return `---
title: ${title}
type: ${type}
---

${body}
`;
}

const BASE_TEST_DIR = "/tmp/sibyl-import-tests";

describe("Wiki Import Routes", () => {
  describe("POST /api/wiki-pages/import", () => {
    let server: FastifyInstance;
    let dbPath: string;
    let testDir: string;

    beforeAll(async () => {
      testDir = join(BASE_TEST_DIR, `import-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      dbPath = join(testDir, "test.db");
      server = await createServer({ dbPath: dbPath });
    });

    afterAll(async () => {
      await server.close();
      closeDatabase();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("should import a markdown file with frontmatter", async () => {
      const filePath = getUniqueTestFile(
        testDir,
        createTestMarkdown("Test Concept", "concept", "Content with [[wiki-links]].")
      );
      const slug = getUniqueSlug();

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath, slug },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.slug).toBe(slug);
      expect(data.data.title).toBe("Test Concept");
      expect(data.data.type).toBe("concept");
      expect(data.data.wikiPageId).toBeDefined();
      expect(data.data.isNew).toBe(true);
    });

    test("should import markdown file with custom type", async () => {
      const filePath = getUniqueTestFile(testDir, "# Simple File\n\nNo frontmatter.");
      const slug = getUniqueSlug();

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath, slug, type: "source" },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.type).toBe("source");
      expect(data.data.isNew).toBe(true);
    });

    test("should update existing page when importing same slug", async () => {
      const filePath1 = getUniqueTestFile(testDir, createTestMarkdown("First Title", "concept", "First content."));
      const filePath2 = getUniqueTestFile(testDir, createTestMarkdown("Second Title", "entity", "Second content."));
      const slug = getUniqueSlug();

      const firstResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath: filePath1, slug },
      });

      expect(firstResponse.statusCode).toBe(200);
      const firstData = JSON.parse(firstResponse.body);
      expect(firstData.data.isNew).toBe(true);
      expect(firstData.data.title).toBe("First Title");

      const secondResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath: filePath2, slug },
      });

      expect(secondResponse.statusCode).toBe(200);
      const secondData = JSON.parse(secondResponse.body);
      expect(secondData.data.isNew).toBe(false);
      expect(secondData.data.wikiPageId).toBe(firstData.data.wikiPageId);
      expect(secondData.data.title).toBe("Second Title");
    });

    test("should return error for non-existent file", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath: "/nonexistent/file.md" },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain("File not found");
    });

    test("should return error for non-markdown file", async () => {
      const txtPath = join(testDir, `txt-${Date.now()}.txt`);
      writeFileSync(txtPath, "Not markdown");

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath: txtPath },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain("must be a markdown file");
    });

    test("should validate request body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/wiki-pages/import-directory", () => {
    let server: FastifyInstance;
    let dbPath: string;
    let testDir: string;

    beforeAll(async () => {
      testDir = join(BASE_TEST_DIR, `import-dir-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      dbPath = join(testDir, "test.db");
      server = await createServer({ dbPath: dbPath });
    });

    afterAll(async () => {
      await server.close();
      closeDatabase();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("should import all markdown files from directory", async () => {
      const dir = join(testDir, `batch-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `concept-${timestamp}.md`), createTestMarkdown("Concept", "concept", "Content."));
      writeFileSync(join(dir, `entity-${timestamp}.md`), createTestMarkdown("Entity", "entity", "Content."));
      writeFileSync(join(dir, `source-${timestamp}.md`), createTestMarkdown("Source", "source", "Content."));

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.total).toBe(3);
      expect(data.data.imported.length).toBe(3);
      expect(data.data.failed.length).toBe(0);
      for (const item of data.data.imported) {
        expect(item.isNew).toBe(true);
      }
    });

    test("should import files recursively when enabled", async () => {
      const dir = join(testDir, `recursive-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, "subdir"), { recursive: true });
      writeFileSync(join(dir, `root-${timestamp}.md`), createTestMarkdown("Root", "concept", "Root."));
      writeFileSync(join(dir, "subdir", `nested-${timestamp}.md`), createTestMarkdown("Nested", "entity", "Nested."));

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir, recursive: true },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.total).toBe(2);
      expect(data.data.imported.length).toBe(2);
    });

    test("should import only top-level files when recursive is false", async () => {
      const dir = join(testDir, `nonrec-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      mkdirSync(join(dir, "subdir"), { recursive: true });
      writeFileSync(join(dir, `top-${timestamp}.md`), createTestMarkdown("Top", "concept", "Top."));
      writeFileSync(join(dir, "subdir", `nested-${timestamp}.md`), createTestMarkdown("Nested", "entity", "Nested."));

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir, recursive: false },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.total).toBe(1);
      expect(data.data.imported[0].slug).toContain("top");
    });

    test("should import all files with specified type", async () => {
      const dir = join(testDir, `type-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `file1-${timestamp}.md`), createTestMarkdown("File1", "concept", "Content."));
      writeFileSync(join(dir, `file2-${timestamp}.md`), createTestMarkdown("File2", "entity", "Content."));

      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir, type: "summary" },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      for (const imported of data.data.imported) {
        expect(imported.type).toBe("summary");
      }
    });

    test("should return error for non-existent directory", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: "/nonexistent-dir" },
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain("Directory not found");
    });

    test("should validate request body", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: {},
      });

      expect(response.statusCode).toBe(400);
    });

    test("should handle re-import of same directory gracefully", async () => {
      const dir = join(testDir, `reimport-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `file-${timestamp}.md`), createTestMarkdown("File", "concept", "Content."));

      const firstResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir },
      });

      expect(firstResponse.statusCode).toBe(200);
      for (const item of JSON.parse(firstResponse.body).data.imported) {
        expect(item.isNew).toBe(true);
      }

      const secondResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir },
      });

      expect(secondResponse.statusCode).toBe(200);
      for (const item of JSON.parse(secondResponse.body).data.imported) {
        expect(item.isNew).toBe(false);
      }
    });
  });

  describe("Imported wiki pages", () => {
    let server: FastifyInstance;
    let dbPath: string;
    let testDir: string;

    beforeAll(async () => {
      testDir = join(BASE_TEST_DIR, `pages-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      dbPath = join(testDir, "test.db");
      server = await createServer({ dbPath: dbPath });
    });

    afterAll(async () => {
      await server.close();
      closeDatabase();
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    test("should be retrievable after import", async () => {
      const filePath = getUniqueTestFile(
        testDir,
        `---
title: Test Page
type: concept
tags: [test, import]
summary: A test summary
---

Content with [[links]].`
      );
      const slug = getUniqueSlug();

      const importResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath, slug },
      });

      expect(importResponse.statusCode).toBe(200);

      const getResponse = await server.inject({
        method: "GET",
        url: `/api/wiki-pages/slug/${slug}`,
      });

      expect(getResponse.statusCode).toBe(200);
      const getData = JSON.parse(getResponse.body);
      expect(getData.data.title).toBe("Test Page");
      expect(getData.data.tags).toEqual(["test", "import"]);
      expect(getData.data.summary).toBe("A test summary");
    });

    test("should appear in wiki index after import", async () => {
      const dir = join(testDir, `index-${Date.now()}`);
      const timestamp = Date.now();
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `page1-${timestamp}.md`), createTestMarkdown("Page One", "concept", "Content."));
      writeFileSync(join(dir, `page2-${timestamp}.md`), createTestMarkdown("Page Two", "entity", "Content."));
      writeFileSync(join(dir, `page3-${timestamp}.md`), createTestMarkdown("Page Three", "source", "Content."));

      const importResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import-directory",
        body: { directoryPath: dir },
      });

      expect(importResponse.statusCode).toBe(200);
      const importedSlugs = JSON.parse(importResponse.body).data.imported.map((i: { slug: string }) => i.slug);

      const indexResponse = await server.inject({
        method: "GET",
        url: "/api/wiki-index",
      });

      expect(indexResponse.statusCode).toBe(200);
      const entries = JSON.parse(indexResponse.body).data;
      const found = entries.filter((e: { slug: string }) => importedSlugs.includes(e.slug));
      expect(found.length).toBe(3);
    });

    test("should have wiki link syntax preserved", async () => {
      const filePath = getUniqueTestFile(
        testDir,
        createTestMarkdown("Link Page", "concept", "Content with [[wiki-links]] preserved.")
      );
      const slug = getUniqueSlug();

      const importResponse = await server.inject({
        method: "POST",
        url: "/api/wiki-pages/import",
        body: { filePath, slug },
      });

      expect(importResponse.statusCode).toBe(200);
      const wikiPageId = JSON.parse(importResponse.body).data.wikiPageId;

      const contentResponse = await server.inject({
        method: "GET",
        url: `/api/wiki-pages/${wikiPageId}/content`,
      });

      expect(contentResponse.statusCode).toBe(200);
      const content = JSON.parse(contentResponse.body).data.content;
      expect(content).toContain("[[wiki-links]]");
    });
  });
});
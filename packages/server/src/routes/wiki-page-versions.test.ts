import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Fastify from "fastify";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../database.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { registerWikiPageVersionsRoutes } from "./wiki-page-versions.js";
import { registerWikiPageRoutes } from "./wiki-pages.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;
let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-version-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  app = Fastify();
  await registerWikiPageRoutes(app);
  await registerWikiPageVersionsRoutes(app);
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

function createTestContentFile(filename: string, content: string): string {
  const filePath = join(testWikiDir, "concepts", filename);
  const dir = join(testWikiDir, "concepts");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, content);
  return filePath;
}

describe("Wiki Page Versions Storage", () => {
  it("should create a wiki page version", async () => {
    const page = await storage.wikiPages.create({
      slug: "test-page",
      title: "Test Page",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "test-page.md"),
      summary: "Initial summary",
      tags: ["test"],
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Initial content",
      summary: page.summary,
      tags: page.tags,
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    const version = await storage.wikiPageVersions.create({
      wikiPageId: page.id,
      version: 1,
      title: page.title,
      summary: page.summary,
      tags: page.tags,
      contentSnapshot: "Initial content",
    });

    expect(version.id).toBeDefined();
    expect(version.wikiPageId).toBe(page.id);
    expect(version.version).toBe(1);
    expect(version.contentSnapshot).toBe("Initial content");
  });

  it("should find versions by wiki page id", async () => {
    const page = await storage.wikiPages.create({
      slug: "multi-version",
      title: "Multi Version Page",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "multi-version.md"),
    });

    for (let i = 1; i <= 3; i++) {
      await storage.wikiPageVersions.create({
        wikiPageId: page.id,
        version: i,
        title: `Version ${i}`,
        contentSnapshot: `Content for version ${i}`,
      });
    }

    const versions = await storage.wikiPageVersions.findByWikiPageId(page.id);
    
    expect(versions.length).toBe(3);
    expect(versions[0].version).toBe(3);
    expect(versions[2].version).toBe(1);
  });

  it("should find version by page id and version number", async () => {
    const page = await storage.wikiPages.create({
      slug: "specific-version",
      title: "Specific Version Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "specific-version.md"),
    });

    await storage.wikiPageVersions.create({
      wikiPageId: page.id,
      version: 2,
      title: "Version 2",
      contentSnapshot: "Content v2",
      changeReason: "Important update",
    });

    const version = await storage.wikiPageVersions.findByWikiPageIdAndVersion(page.id, 2);
    
    expect(version).toBeDefined();
    expect(version?.version).toBe(2);
    expect(version?.changeReason).toBe("Important update");
  });

  it("should count versions", async () => {
    const page = await storage.wikiPages.create({
      slug: "count-test",
      title: "Count Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "count-test.md"),
    });

    for (let i = 1; i <= 5; i++) {
      await storage.wikiPageVersions.create({
        wikiPageId: page.id,
        version: i,
        title: `Version ${i}`,
        contentSnapshot: `Content ${i}`,
      });
    }

    const count = await storage.wikiPageVersions.count(page.id);
    expect(count).toBe(5);
  });

  it("should delete all versions for a wiki page", async () => {
    const page = await storage.wikiPages.create({
      slug: "delete-test",
      title: "Delete Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "delete-test.md"),
    });

    await storage.wikiPageVersions.create({
      wikiPageId: page.id,
      version: 1,
      title: "Version 1",
      contentSnapshot: "Content 1",
    });

    await storage.wikiPageVersions.deleteByWikiPageId(page.id);

    const versions = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versions.length).toBe(0);
  });
});

describe("Wiki Page Update with Version History", () => {
  it("should automatically save version history when updating", async () => {
    const page = await storage.wikiPages.create({
      slug: "auto-version",
      title: "Auto Version Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "auto-version.md"),
      summary: "Initial summary",
      tags: ["initial"],
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Original content here",
      summary: page.summary,
      tags: page.tags,
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    const updatedPage = await storage.wikiPages.update(page.id, {
      title: "Updated Title",
      summary: "Updated summary",
    }, {
      changedBy: "test-user",
      changeReason: "Testing version history",
      wikiFileManager: wikiManager,
    });

    expect(updatedPage?.version).toBe(2);

    const versions = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].title).toBe("Auto Version Test");
    expect(versions[0].contentSnapshot).toBe("Original content here");
    expect(versions[0].changedBy).toBe("test-user");
    expect(versions[0].changeReason).toBe("Testing version history");
  });

  it("should increment version number on each update", async () => {
    const page = await storage.wikiPages.create({
      slug: "increment-test",
      title: "Increment Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "increment-test.md"),
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Content v1",
      summary: "",
      tags: [],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    for (let i = 2; i <= 4; i++) {
      wikiManager.updatePage({
        title: `Title v${i}`,
        type: page.type,
        slug: page.slug,
        content: `Content v${i}`,
        summary: "",
        tags: [],
        sourceIds: [],
        createdAt: page.createdAt,
        updatedAt: Date.now(),
      });

      await storage.wikiPages.update(page.id, {
        title: `Title v${i}`,
      }, { wikiFileManager: wikiManager });
    }

    const finalPage = await storage.wikiPages.findById(page.id);
    expect(finalPage?.version).toBe(4);

    const versions = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versions.length).toBe(3);
  });
});

describe("Wiki Page Versions API Routes", () => {
  it("should return version history for a wiki page", async () => {
    const page = await storage.wikiPages.create({
      slug: "api-test",
      title: "API Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "api-test.md"),
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "API test content",
      summary: "",
      tags: [],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    await storage.wikiPages.update(page.id, { title: "Updated API Test" }, { wikiFileManager: wikiManager });

    const response = await app.inject({
      method: "GET",
      url: `/api/wiki-pages/${page.id}/versions`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.wikiPageId).toBe(page.id);
    expect(body.data.currentVersion).toBe(2);
    expect(body.data.totalVersions).toBe(1);
    expect(body.data.versions.length).toBe(1);
  });

  it("should return 404 for non-existent wiki page", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/wiki-pages/nonexistent-id/versions",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should return specific version details", async () => {
    const page = await storage.wikiPages.create({
      slug: "version-detail",
      title: "Version Detail Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "version-detail.md"),
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Version 1 content",
      summary: "",
      tags: ["v1"],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    await storage.wikiPages.update(page.id, { title: "Version 2 Title" }, { changeReason: "Update test", wikiFileManager: wikiManager });

    const response = await app.inject({
      method: "GET",
      url: `/api/wiki-pages/${page.id}/versions/1`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.version).toBe(1);
    expect(body.data.title).toBe("Version Detail Test");
    expect(body.data.contentSnapshot).toBe("Version 1 content");
  });

  it("should return 404 for non-existent version", async () => {
    const page = await storage.wikiPages.create({
      slug: "no-version",
      title: "No Version",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "no-version.md"),
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/wiki-pages/${page.id}/versions/99`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("should restore a wiki page to a previous version", async () => {
    const page = await storage.wikiPages.create({
      slug: "restore-test",
      title: "Restore Test V1",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "restore-test.md"),
      tags: ["v1"],
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Content version 1",
      summary: "",
      tags: page.tags,
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    await storage.wikiPages.update(page.id, { title: "Restore Test V1" }, { wikiFileManager: wikiManager });

    wikiManager.updatePage({
      title: "Restore Test V2",
      type: page.type,
      slug: page.slug,
      content: "Content version 2",
      summary: "",
      tags: ["v2"],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: Date.now(),
    });

    await storage.wikiPages.update(page.id, { title: "Restore Test V2", tags: ["v2"] }, { wikiFileManager: wikiManager });

    const versions = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versions.length).toBe(2);

    const v1Record = await storage.wikiPageVersions.findByWikiPageIdAndVersion(page.id, 1);
    expect(v1Record?.contentSnapshot).toBe("Content version 1");
    expect(v1Record?.title).toBe("Restore Test V1");
  });

  it("should compute diff between versions", async () => {
    const page = await storage.wikiPages.create({
      slug: "diff-test",
      title: "Diff Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "diff-test.md"),
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Line 1\nLine 2\nLine 3",
      summary: "",
      tags: [],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    await storage.wikiPages.update(page.id, { title: page.title }, { wikiFileManager: wikiManager });

    wikiManager.updatePage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Line 1\nModified Line 2\nLine 3\nNew Line 4",
      summary: "",
      tags: [],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: Date.now(),
    });

    await storage.wikiPages.update(page.id, { title: "Diff Test Updated" }, { wikiFileManager: wikiManager });

    const response = await app.inject({
      method: "GET",
      url: `/api/wiki-pages/${page.id}/versions/diff/1/2`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.version1.version).toBe(1);
    expect(body.data.version2.version).toBe(2);
    expect(body.data.diff.additions).toBeGreaterThanOrEqual(0);
    expect(body.data.diff.deletions).toBeGreaterThanOrEqual(0);
    expect(body.data.diff.changes).toBeDefined();
  });

  it("should delete versions when wiki page is deleted", async () => {
    const page = await storage.wikiPages.create({
      slug: "delete-versions",
      title: "Delete Versions Test",
      type: "concept",
      contentPath: join(testWikiDir, "concepts", "delete-versions.md"),
    });

    wikiManager.createPage({
      title: page.title,
      type: page.type,
      slug: page.slug,
      content: "Content",
      summary: "",
      tags: [],
      sourceIds: [],
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    await storage.wikiPages.update(page.id, { title: "Updated" }, { wikiFileManager: wikiManager });
    await storage.wikiPages.update(page.id, { title: "Updated Again" }, { wikiFileManager: wikiManager });

    const versionsBefore = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versionsBefore.length).toBe(2);

    await storage.wikiPages.delete(page.id);

    const versionsAfter = await storage.wikiPageVersions.findByWikiPageId(page.id);
    expect(versionsAfter.length).toBe(0);
  });
});
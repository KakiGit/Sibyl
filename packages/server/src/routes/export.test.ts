import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import Fastify from "fastify";
import { registerExportRoutes } from "./export.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-export-route-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerExportRoutes(fastify);
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

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

async function createWikiLink(fromSlug: string, toSlug: string): Promise<void> {
  const fromPage = await storage.wikiPages.findBySlug(fromSlug);
  const toPage = await storage.wikiPages.findBySlug(toSlug);
  
  if (fromPage && toPage) {
    await storage.wikiLinks.create({
      fromPageId: fromPage.id,
      toPageId: toPage.id,
      relationType: "reference",
    });
  }
}

describe("Export Routes", () => {
  describe("GET /api/export", () => {
    beforeEach(async () => {
      await createWikiPage("python", "Python Programming", "concept", "Python is a high-level programming language.");
      await createWikiPage("javascript", "JavaScript Guide", "concept", "JavaScript is used for web development.");
      await createWikiPage("react", "React Framework", "entity", "React is a JavaScript library for UI.");
      await createWikiLink("react", "javascript");
      await createWikiLink("python", "javascript");
    });

    it("should export wiki pages in JSON format", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.format).toBe("json");
      expect(body.data.totalPages).toBe(3);
      expect(body.data.pages).toBeDefined();
      expect(body.data.pages.length).toBe(3);
    });

    it("should export wiki pages in markdown bundle format", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export?format=markdown",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.format).toBe("markdown");
      expect(body.data.totalPages).toBe(3);
      expect(body.data.markdown).toBeDefined();
      expect(body.data.markdown).toContain("# Sibyl Wiki Export");
      expect(body.data.markdown).toContain("[[python]]");
      expect(body.data.markdown).toContain("Python Programming");
    });

    it("should include content by default", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pages[0].content).toBeDefined();
    });

    it("should not have content when includeContent=false", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export?includeContent=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.pages[0].content).toBeUndefined();
    });

    it("should include links by default", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const reactPage = body.data.pages.find((p: { slug: string }) => p.slug === "react");
      expect(reactPage.links).toBeDefined();
      expect(reactPage.links.outgoing).toBeDefined();
      expect(reactPage.links.outgoing.length).toBe(1);
      expect(reactPage.links.outgoing[0].toSlug).toBe("javascript");
    });

    it("should exclude links when includeLinks=false", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export?includeLinks=false",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      for (const page of body.data.pages) {
        expect(page.links).toBeUndefined();
      }
    });

    it("should filter by type", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export?type=concept",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalPages).toBe(2);
      expect(body.data.pages.every((p: { type: string }) => p.type === "concept")).toBe(true);
    });

    it("should include all page metadata", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const page = body.data.pages[0];

      expect(page.id).toBeDefined();
      expect(page.slug).toBeDefined();
      expect(page.title).toBeDefined();
      expect(page.type).toBeDefined();
      expect(page.createdAt).toBeDefined();
      expect(page.updatedAt).toBeDefined();
      expect(page.version).toBeDefined();
    });

    it("should include incoming links", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      const jsPage = body.data.pages.find((p: { slug: string }) => p.slug === "javascript");
      expect(jsPage.links.incoming).toBeDefined();
      expect(jsPage.links.incoming.length).toBe(2);
    });

    it("should return empty pages array when no pages exist", async () => {
      const pages = await storage.wikiPages.findAll();
      for (const page of pages) {
        await storage.wikiPages.delete(page.id);
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalPages).toBe(0);
      expect(body.data.pages).toEqual([]);
    });

    it("should mark pages with wiki link syntax in markdown format", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export?format=markdown",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.markdown).toContain("[[python]] - Python Programming");
      expect(body.data.markdown).toContain("**Incoming Links:**");
    });

    it("should include export timestamp", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.exportedAt).toBeDefined();
      expect(body.data.exportedAt).toBeGreaterThan(0);
    });
  });

  describe("GET /api/export/stats", () => {
    beforeEach(async () => {
      await createWikiPage("typescript", "TypeScript", "concept", "TypeScript is typed JavaScript.");
      await createWikiPage("vue", "Vue.js", "concept", "Vue is a progressive framework.");
      await createWikiPage("angular", "Angular", "entity", "Angular is a platform.");
      await createWikiLink("vue", "typescript");
    });

    it("should return export statistics", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export/stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.totalPages).toBe(3);
      expect(body.data.totalLinks).toBe(1);
      expect(body.data.canExport).toBe(true);
    });

    it("should return type counts", async () => {
      const response = await fastify.inject({
        method: "GET",
        url: "/api/export/stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.types).toBeDefined();
      expect(body.data.types.concept).toBe(2);
      expect(body.data.types.entity).toBe(1);
    });

    it("should indicate canExport=false when no pages", async () => {
      const pages = await storage.wikiPages.findAll();
      for (const page of pages) {
        await storage.wikiPages.delete(page.id);
      }

      const response = await fastify.inject({
        method: "GET",
        url: "/api/export/stats",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.totalPages).toBe(0);
      expect(body.data.canExport).toBe(false);
    });
  });
});
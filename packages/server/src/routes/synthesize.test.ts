import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import { resetLlmProvider, loadLlmConfig } from "../llm/index.js";
import Fastify from "fastify";
import { registerSynthesizeRoutes } from "./synthesize.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let wikiManager: WikiFileManager;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-synthesize-route-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");

  mkdirSync(testWikiDir, { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);

  fastify = Fastify({ logger: false });
  await registerSynthesizeRoutes(fastify);

  resetLlmProvider();
});

afterEach(async () => {
  closeDatabase();
  resetLlmProvider();
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

describe("Synthesize Routes", () => {
  describe("POST /api/synthesize - Validation", () => {
    it("should require query field", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("should validate query is not empty", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate maxPages is positive", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          maxPages: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate maxPages is within range", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          maxPages: 20,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate types parameter", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          types: ["invalid"],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept valid types", async () => {
      await createWikiPage("test-page", "Test Page", "concept", "Test content.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          types: ["entity", "concept", "source", "summary"],
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should accept valid tags parameter", async () => {
      await createWikiPage("test-page", "Test Page", "concept", "Test content.", ["tag1"]);

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          tags: ["tag1", "tag2"],
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should accept valid maxPages", async () => {
      await createWikiPage("test-page", "Test Page", "concept", "Test content.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          maxPages: 5,
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should accept skipLlm parameter", async () => {
      await createWikiPage("test-page", "Test Page", "concept", "Test content.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/synthesize - Basic Functionality", () => {
    beforeEach(async () => {
      await createWikiPage(
        "python",
        "Python Programming",
        "concept",
        "Python is a high-level programming language known for its readability and versatility. It supports multiple programming paradigms."
      );
      await createWikiPage(
        "javascript",
        "JavaScript Guide",
        "concept",
        "JavaScript is a dynamic programming language primarily used for web development."
      );
    });

    it("should return 200 for valid query with skipLlm", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python programming language",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should return data structure with required fields", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python programming language",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.query).toBe("Python programming language");
      expect(body.data.answer).toBeDefined();
      expect(body.data.citations).toBeDefined();
      expect(Array.isArray(body.data.citations)).toBe(true);
      expect(body.data.synthesizedAt).toBeDefined();
      expect(body.data.filedPage).toBeDefined();
    });

    it("should return message when no matches found", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "nonexistentxyzabc unique term",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.answer).toContain("No relevant wiki pages found");
      expect(body.data.citations.length).toBe(0);
    });

    it("should include matched wiki page in citations", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      const pythonCitation = body.data.citations.find(
        (c: { pageSlug: string }) => c.pageSlug === "python"
      );
      expect(pythonCitation).toBeDefined();
      expect(pythonCitation?.pageTitle).toBe("Python Programming");
      expect(pythonCitation?.pageType).toBe("concept");
    });

    it("should include relevance score in citations", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      for (const citation of body.data.citations) {
        expect(citation.relevanceScore).toBeDefined();
        expect(typeof citation.relevanceScore).toBe("number");
      }
    });

    it("should return basic summary when LLM skipped", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.answer).toBeDefined();
      expect(body.data.model).toBeUndefined();
    });

    it("should include filedPage when citations exist", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Python",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.filedPage).toBeDefined();
      expect(body.data.filedPage?.slug).toBeDefined();
      expect(body.data.filedPage?.title).toBeDefined();
      expect(body.data.filedPage?.type).toBe("summary");
      expect(body.data.filedPage?.wikiPageId).toBeDefined();
      expect(body.data.filedPage?.filedAt).toBeDefined();
    });

    it("should not include filedPage when no citations", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "nonexistentxyzabc unique term",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.filedPage).toBeUndefined();
    });

    it("should handle error gracefully", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "test query for error handling",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data).toBeDefined();
    });
  });

  describe("POST /api/synthesize/stream - Validation", () => {
    it("should require query field for streaming", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate query is not empty for streaming", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate maxPages for streaming", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "test",
          maxPages: 20,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should validate types for streaming", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "test",
          types: ["invalid"],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should accept skipLlm for streaming", async () => {
      await createWikiPage("stream-test", "Stream Test", "concept", "Content.");

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "test",
          skipLlm: true,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("POST /api/synthesize/stream - Basic Functionality", () => {
    beforeEach(async () => {
      await createWikiPage(
        "stream-test",
        "Stream Test Page",
        "concept",
        "Content for testing the streaming synthesis endpoint."
      );
    });

    it("should return text/event-stream content type", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
    });

    it("should emit start event with query", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test query",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = response.body;
      expect(body).toContain("event: start");
      expect(body).toContain("Stream test query");
    });

    it("should emit answer event", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = response.body;
      expect(body).toContain("event: answer");
    });

    it("should emit citations event", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = response.body;
      expect(body).toContain("event: citations");
    });

    it("should emit done event", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = response.body;
      expect(body).toContain("event: done");
    });

    it("should emit done event without model when LLM skipped", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize/stream",
        payload: {
          query: "Stream test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = response.body;
      expect(body).toContain("event: done");
      expect(body).not.toMatch(/"model":"[^"]/);
    });
  });

  describe("Response Format", () => {
    beforeEach(async () => {
      await createWikiPage(
        "format-test",
        "Format Test",
        "concept",
        "Testing response format structure."
      );
    });

    it("should return JSON response with data wrapper", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Format test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });

    it("should include timestamp in synthesizedAt", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Format test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data.synthesizedAt).toBeDefined();
      expect(typeof body.data.synthesizedAt).toBe("number");
      expect(body.data.synthesizedAt).toBeGreaterThan(0);
    });

    it("should include citations with correct structure", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Format test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data.citations)).toBe(true);

      if (body.data.citations.length > 0) {
        const citation = body.data.citations[0];
        expect(citation.pageSlug).toBeDefined();
        expect(citation.pageTitle).toBeDefined();
        expect(citation.pageType).toBeDefined();
        expect(citation.relevanceScore).toBeDefined();
      }
    });

    it("should include pageType as valid enum value", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Format test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = JSON.parse(response.body);
      const validTypes = ["entity", "concept", "source", "summary"];

      for (const citation of body.data.citations) {
        expect(validTypes).toContain(citation.pageType);
      }
    });

    it("should return model field undefined when skipLlm", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "Format test",
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.model).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should return 400 for malformed JSON", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        body: "invalid json",
        headers: { "Content-Type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should handle missing content-type header", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: { query: "test", skipLlm: true, useQueryRewriting: false },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should return 500 on synthesis error", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "a b c",
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe("Filtering", () => {
    beforeEach(async () => {
      await createWikiPage("entity-page", "Entity Page", "entity", "Entity content.");
      await createWikiPage("concept-page", "Concept Page", "concept", "Concept content.");
      await createWikiPage("source-page", "Source Page", "source", "Source content.");
      await createWikiPage("tagged-page", "Tagged Page", "concept", "Tagged content.", ["special", "test"]);
    });

    it("should filter by types", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "page",
          types: ["entity"],
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      for (const citation of body.data.citations) {
        expect(citation.pageType).toBe("entity");
      }
    });

    it("should filter by tags", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "page",
          tags: ["special"],
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      
      expect(body.data.citations.some((c: { pageSlug: string }) => c.pageSlug === "tagged-page")).toBe(true);
    });

    it("should respect maxPages limit", async () => {
      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "page",
          maxPages: 2,
          skipLlm: true,
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.citations.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Real LLM Integration", () => {
    it("should handle real LLM synthesis when configured", async () => {
      const config = loadLlmConfig();

      if (!config) {
        console.log("Skipping real LLM test: config not available");
        return;
      }

      await createWikiPage(
        "typescript-info",
        "TypeScript Information",
        "concept",
        "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It adds optional static typing and class-based object-oriented programming."
      );

      const response = await fastify.inject({
        method: "POST",
        url: "/api/synthesize",
        payload: {
          query: "What is TypeScript?",
          useQueryRewriting: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.answer).toBeDefined();
      expect(body.data.answer.length).toBeGreaterThan(10);
      expect(body.data.model).toBe(config.model);
    }, 60000);
  });
});
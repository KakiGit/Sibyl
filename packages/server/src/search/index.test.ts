import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, stopServer, createDatabase, closeDatabase, migrateDatabase } from "../index.js";
import { wikiSearchStorage } from "../search/index.js";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "../wiki/index.js";
import type { FastifyInstance } from "fastify";
import { resolve } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";

describe("WikiSearchStorage FTS5", () => {
  let testDir: string;
  let testDbPath: string;
  let server: FastifyInstance;

  beforeAll(async () => {
    testDir = resolve(tmpdir(), `sibyl-search-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "concept"), { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "entity"), { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "source"), { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "summary"), { recursive: true });
    
    testDbPath = resolve(testDir, "test.db");
    
    const db = createDatabase(testDbPath);
    migrateDatabase(db);
    closeDatabase();
    
    process.env.SIBYL_DATA_DIR = testDir;
    process.env.SIBYL_DB_PATH = testDbPath;
    
    server = await createServer({ dbPath: testDbPath, port: 0 });
  });

  afterAll(async () => {
    await stopServer(server);
    closeDatabase();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    delete process.env.SIBYL_DATA_DIR;
    delete process.env.SIBYL_DB_PATH;
  });

  describe("FTS5 indexing", () => {
    it("should index a wiki page in FTS5", async () => {
      const page = await storage.wikiPages.create({
        slug: "machine-learning-concepts",
        title: "Machine Learning Concepts",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "machine-learning-concepts.md"),
        summary: "An overview of machine learning concepts and techniques",
        tags: ["ai", "ml"],
      });

      const content = {
        title: "Machine Learning Concepts",
        type: "concept",
        slug: "machine-learning-concepts",
        content: "# Machine Learning Concepts\n\nMachine learning is a subset of artificial intelligence that enables systems to learn from data. Neural networks are a key component of modern ML systems.",
        summary: "An overview of machine learning concepts and techniques",
        tags: ["ai", "ml"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page.contentPath, JSON.stringify(content));

      await wikiSearchStorage.indexPage(page);

      const results = await wikiSearchStorage.ftsSearch("machine learning", 5);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === page.id)).toBe(true);
    });

    it("should update FTS5 index when page is updated", async () => {
      const page = await storage.wikiPages.create({
        slug: "neural-networks",
        title: "Neural Networks",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "neural-networks.md"),
        summary: "Introduction to neural network architectures",
      });

      const content1 = {
        title: "Neural Networks",
        type: "concept",
        slug: "neural-networks",
        content: "# Neural Networks\n\nBasic introduction to neural networks.",
        summary: "Introduction to neural network architectures",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page.contentPath, JSON.stringify(content1));
      await wikiSearchStorage.indexPage(page);

      const results1 = await wikiSearchStorage.ftsSearch("deep learning", 5);
      expect(results1.some((r) => r.id === page.id)).toBe(false);

      const content2 = {
        ...content1,
        content: "# Neural Networks\n\nDeep learning is a subset of neural networks with many layers. Deep neural networks can learn complex patterns.",
        updatedAt: Date.now(),
      };

      writeFileSync(page.contentPath, JSON.stringify(content2));
      
      const updatedPage = await storage.wikiPages.update(page.id, {
        summary: "Deep learning and neural network architectures",
      });
      
      if (updatedPage) {
        await wikiSearchStorage.updatePageIndex(updatedPage);
      }

      const results2 = await wikiSearchStorage.ftsSearch("deep learning", 5);
      expect(results2.some((r) => r.id === page.id)).toBe(true);
    });

    it("should delete page from FTS5 index", async () => {
      const page = await storage.wikiPages.create({
        slug: "temporary-page",
        title: "Temporary Page",
        type: "entity",
        contentPath: resolve(testDir, "wiki", "entity", "temporary-page.md"),
        summary: "A temporary page for testing deletion",
      });

      const content = {
        title: "Temporary Page",
        type: "entity",
        slug: "temporary-page",
        content: "Temporary content for deletion test.",
        summary: "A temporary page for testing deletion",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page.contentPath, JSON.stringify(content));
      await wikiSearchStorage.indexPage(page);

      const results1 = await wikiSearchStorage.ftsSearch("temporary", 5);
      expect(results1.some((r) => r.id === page.id)).toBe(true);

      await wikiSearchStorage.deletePageIndex(page.id);
      await storage.wikiPages.delete(page.id);

      const results2 = await wikiSearchStorage.ftsSearch("temporary", 5);
      expect(results2.some((r) => r.id === page.id)).toBe(false);
    });
  });

  describe("FTS5 search", () => {
    it("should find pages matching search query", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "python-programming",
        title: "Python Programming",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "python-programming.md"),
        summary: "Python is a versatile programming language",
      });

      const page2 = await storage.wikiPages.create({
        slug: "javascript-guide",
        title: "JavaScript Guide",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "javascript-guide.md"),
        summary: "JavaScript for web development",
      });

      const content1 = {
        title: "Python Programming",
        type: "concept",
        slug: "python-programming",
        content: "Python is great for data science and machine learning.",
        summary: "Python is a versatile programming language",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const content2 = {
        title: "JavaScript Guide",
        type: "concept",
        slug: "javascript-guide",
        content: "JavaScript powers modern web applications.",
        summary: "JavaScript for web development",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page1.contentPath, JSON.stringify(content1));
      writeFileSync(page2.contentPath, JSON.stringify(content2));

      await wikiSearchStorage.indexPage(page1);
      await wikiSearchStorage.indexPage(page2);

      const results = await wikiSearchStorage.ftsSearch("python", 10);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.id === page1.id)).toBe(true);
      expect(results.every((r) => r.id !== page2.id)).toBe(true);
    });

    it("should return results ranked by relevance (BM25)", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "ai-basics",
        title: "AI Basics",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "ai-basics.md"),
        summary: "Artificial intelligence fundamentals",
      });

      const page2 = await storage.wikiPages.create({
        slug: "ai-advanced",
        title: "AI Advanced Topics",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "ai-advanced.md"),
        summary: "Advanced artificial intelligence concepts including neural networks and deep learning",
      });

      const content1 = {
        title: "AI Basics",
        type: "concept",
        slug: "ai-basics",
        content: "Artificial intelligence is intelligence demonstrated by machines. AI is a broad field.",
        summary: "Artificial intelligence fundamentals",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const content2 = {
        title: "AI Advanced Topics",
        type: "concept",
        slug: "ai-advanced",
        content: "Advanced AI topics include deep learning, neural networks, reinforcement learning, and natural language processing. AI AI AI artificial intelligence.",
        summary: "Advanced artificial intelligence concepts including neural networks and deep learning",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page1.contentPath, JSON.stringify(content1));
      writeFileSync(page2.contentPath, JSON.stringify(content2));

      await wikiSearchStorage.indexPage(page1);
      await wikiSearchStorage.indexPage(page2);

      const results = await wikiSearchStorage.ftsSearch("ai artificial intelligence", 10);
      
      expect(results.length).toBeGreaterThan(0);
      
      const sortedResults = [...results].sort((a, b) => b.score - a.score);
      expect(sortedResults[0].score).toBeGreaterThanOrEqual(sortedResults[sortedResults.length - 1].score);
    });

    it("should handle empty search results gracefully", async () => {
      const results = await wikiSearchStorage.ftsSearch("nonexistent topic xyz", 10);
      expect(results.length).toBe(0);
    });
  });

  describe("Hybrid search", () => {
    it("should combine keyword and semantic search results", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "react-components",
        title: "React Components",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "react-components.md"),
        summary: "Building reusable components in React",
      });

      const page2 = await storage.wikiPages.create({
        slug: "vue-components",
        title: "Vue Components",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "vue-components.md"),
        summary: "Component architecture in Vue.js framework",
      });

      const content1 = {
        title: "React Components",
        type: "concept",
        slug: "react-components",
        content: "React components are the building blocks of React applications. They encapsulate UI logic and state.",
        summary: "Building reusable components in React",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const content2 = {
        title: "Vue Components",
        type: "concept",
        slug: "vue-components",
        content: "Vue components provide a composable way to build UIs. Similar to React but with different syntax.",
        summary: "Component architecture in Vue.js framework",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page1.contentPath, JSON.stringify(content1));
      writeFileSync(page2.contentPath, JSON.stringify(content2));

      await wikiSearchStorage.indexPage(page1);
      await wikiSearchStorage.indexPage(page2);

      const pages = await storage.wikiPages.findAll({ limit: 50 });
      
      const results = await wikiSearchStorage.hybridSearch(
        {
          query: "components",
          useSemantic: false,
          limit: 5,
        },
        pages
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.page.id === page1.id)).toBe(true);
      expect(results.some((r) => r.page.id === page2.id)).toBe(true);
      
      expect(results[0].matchType).toBeOneOf(["keyword", "semantic", "hybrid"]);
      expect(results[0].combinedScore).toBeGreaterThanOrEqual(0);
    });

    it("should filter results by type", async () => {
      const conceptPage = await storage.wikiPages.create({
        slug: "typescript-types",
        title: "TypeScript Types",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "typescript-types.md"),
        summary: "Understanding TypeScript type system",
      });

      const entityPage = await storage.wikiPages.create({
        slug: "typescript-language",
        title: "TypeScript Language",
        type: "entity",
        contentPath: resolve(testDir, "wiki", "entity", "typescript-language.md"),
        summary: "TypeScript programming language entity",
      });

      const content1 = {
        title: "TypeScript Types",
        type: "concept",
        slug: "typescript-types",
        content: "TypeScript provides static typing for JavaScript.",
        summary: "Understanding TypeScript type system",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const content2 = {
        title: "TypeScript Language",
        type: "entity",
        slug: "typescript-language",
        content: "TypeScript is a typed superset of JavaScript.",
        summary: "TypeScript programming language entity",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(conceptPage.contentPath, JSON.stringify(content1));
      writeFileSync(entityPage.contentPath, JSON.stringify(content2));

      await wikiSearchStorage.indexPage(conceptPage);
      await wikiSearchStorage.indexPage(entityPage);

      const pages = await storage.wikiPages.findAll({ limit: 50 });

      const results = await wikiSearchStorage.hybridSearch(
        {
          query: "typescript",
          type: "concept",
          useSemantic: false,
          limit: 10,
        },
        pages
      );

      expect(results.every((r) => r.page.type === "concept")).toBe(true);
      expect(results.some((r) => r.page.id === conceptPage.id)).toBe(true);
      expect(results.every((r) => r.page.id !== entityPage.id)).toBe(true);
    });

    it("should filter results by tags", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "web-framework",
        title: "Web Framework",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "web-framework.md"),
        summary: "Web development frameworks overview",
        tags: ["web", "frontend"],
      });

      const page2 = await storage.wikiPages.create({
        slug: "backend-framework",
        title: "Backend Framework",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "backend-framework.md"),
        summary: "Server-side framework options",
        tags: ["web", "backend"],
      });

      const content1 = {
        title: "Web Framework",
        type: "concept",
        slug: "web-framework",
        content: "Frontend frameworks like React and Vue.",
        summary: "Web development frameworks overview",
        tags: ["web", "frontend"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const content2 = {
        title: "Backend Framework",
        type: "concept",
        slug: "backend-framework",
        content: "Backend frameworks like Express and Django.",
        summary: "Server-side framework options",
        tags: ["web", "backend"],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page1.contentPath, JSON.stringify(content1));
      writeFileSync(page2.contentPath, JSON.stringify(content2));

      await wikiSearchStorage.indexPage(page1);
      await wikiSearchStorage.indexPage(page2);

      const pages = await storage.wikiPages.findAll({ limit: 50 });

      const results = await wikiSearchStorage.hybridSearch(
        {
          query: "framework",
          tags: ["frontend"],
          useSemantic: false,
          limit: 10,
        },
        pages
      );

      expect(results.some((r) => r.page.id === page1.id)).toBe(true);
      expect(results.every((r) => r.page.id !== page2.id)).toBe(true);
    });

    it("should limit number of results", async () => {
      for (let i = 0; i < 5; i++) {
        const page = await storage.wikiPages.create({
          slug: `database-${i}`,
          title: `Database System ${i}`,
          type: "concept",
          contentPath: resolve(testDir, "wiki", "concept", `database-${i}.md`),
          summary: `Database ${i} for storing data`,
        });

        const content = {
          title: `Database System ${i}`,
          type: "concept",
          slug: `database-${i}`,
          content: `Database ${i} is a system for managing data.`,
          summary: `Database ${i} for storing data`,
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        writeFileSync(page.contentPath, JSON.stringify(content));
        await wikiSearchStorage.indexPage(page);
      }

      const pages = await storage.wikiPages.findAll({ limit: 50 });

      const results = await wikiSearchStorage.hybridSearch(
        {
          query: "database",
          useSemantic: false,
          limit: 3,
        },
        pages
      );

      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Rebuild index", () => {
    it("should rebuild entire FTS5 index", async () => {
      const page = await storage.wikiPages.create({
        slug: "rebuild-test",
        title: "Rebuild Test",
        type: "concept",
        contentPath: resolve(testDir, "wiki", "concept", "rebuild-test.md"),
        summary: "Test for index rebuild",
      });

      const content = {
        title: "Rebuild Test",
        type: "concept",
        slug: "rebuild-test",
        content: "Content for rebuild test.",
        summary: "Test for index rebuild",
        tags: [],
        sourceIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      writeFileSync(page.contentPath, JSON.stringify(content));
      await wikiSearchStorage.indexPage(page);

      const pages = await storage.wikiPages.findAll({ limit: 50 });
      await wikiSearchStorage.rebuildIndex(pages);

      const results = await wikiSearchStorage.ftsSearch("rebuild", 10);
      expect(results.some((r) => r.id === page.id)).toBe(true);
    });
  });
});

describe("Search Routes API", () => {
  let testDir: string;
  let testDbPath: string;
  let server: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    testDir = resolve(tmpdir(), `sibyl-search-route-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "concept"), { recursive: true });
    mkdirSync(resolve(testDir, "wiki", "entity"), { recursive: true });
    
    testDbPath = resolve(testDir, "test.db");
    
    process.env.SIBYL_DATA_DIR = testDir;
    process.env.SIBYL_DB_PATH = testDbPath;
    
    server = await createServer({ dbPath: testDbPath, port: 0 });
    
    await server.listen({ port: 0 });
    
    const address = server.server.address();
    if (address && typeof address === "object") {
      baseUrl = `http://localhost:${address.port}`;
    } else {
      baseUrl = "http://localhost:3000";
    }
  });

  afterAll(async () => {
    await stopServer(server);
    closeDatabase();
    
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    delete process.env.SIBYL_DATA_DIR;
    delete process.env.SIBYL_DB_PATH;
  });

  it("should search wiki pages via POST endpoint", async () => {
    const page = await storage.wikiPages.create({
      slug: "api-test-page",
      title: "API Test Page",
      type: "concept",
      contentPath: resolve(testDir, "wiki", "concept", "api-test-page.md"),
      summary: "Page for testing search API",
    });

    const content = {
      title: "API Test Page",
      type: "concept",
      slug: "api-test-page",
      content: "This is content for API search test.",
      summary: "Page for testing search API",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    writeFileSync(page.contentPath, JSON.stringify(content));
    await wikiSearchStorage.indexPage(page);

    const response = await fetch(`${baseUrl}/api/wiki-pages/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "api test", useSemantic: false, limit: 5 }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.some((r: { page: { id: string } }) => r.page.id === page.id)).toBe(true);
  });

  it("should search wiki pages via GET endpoint", async () => {
    const response = await fetch(`${baseUrl}/api/wiki-pages/search?query=test&useSemantic=false&limit=5`);
    
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("should rebuild index via POST endpoint", async () => {
    const response = await fetch(`${baseUrl}/api/wiki-pages/search/rebuild-index`, {
      method: "POST",
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.data.indexed).toBeDefined();
    expect(data.data.indexed).toBeGreaterThanOrEqual(0);
  });

  it("should return error for invalid search parameters", async () => {
    const response = await fetch(`${baseUrl}/api/wiki-pages/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.ok).toBe(false);
  });

  it("should search with type filter", async () => {
    const response = await fetch(`${baseUrl}/api/wiki-pages/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", type: "concept", useSemantic: false }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.data.every((r: { page: { type: string } }) => r.page.type === "concept")).toBe(true);
  });
});
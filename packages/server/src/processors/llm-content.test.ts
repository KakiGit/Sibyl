import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase, WikiFileManager } from "../index.js";
import { storage } from "../storage/index.js";
import { generateWikiContent, generateWikiPageWithLlm } from "./llm-content.js";
import { ingestWithLlm } from "./ingest.js";
import { LlmProvider, loadLlmConfig, resetLlmProvider } from "../llm/index.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-llm-content-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);
  resetLlmProvider();
});

afterEach(async () => {
  closeDatabase();
  resetLlmProvider();
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

function createMockLlmProvider(): LlmProvider {
  return {
    name: "mock-provider",
    call: vi.fn(async (systemPrompt: string, userPrompt: string) => {
      return {
        content: JSON.stringify({
          title: "TypeScript Programming",
          summary: "TypeScript is a strongly typed programming language that builds on JavaScript.",
          content: `# TypeScript Programming

TypeScript is a [[strongly-typed]] programming language that builds on JavaScript. It adds static type definitions.

## Key Features

- Static typing with type inference
- Interfaces and type aliases
- Generics for reusable code

Related concepts: [[javascript]], [[programming]], [[static-typing]].`,
          tags: ["typescript", "javascript", "programming", "types"],
          type: "concept",
          crossReferences: ["javascript", "programming"],
        }),
        model: "mock-model",
        usage: {
          promptTokens: 300,
          completionTokens: 150,
          totalTokens: 450,
        },
      };
    }),
    synthesize: vi.fn(async (prompt: string) => {
      return "Mock synthesized response";
    }),
    getConfig: vi.fn(() => ({
      baseUrl: "https://mock.api",
      apiKey: "mock-key",
      model: "mock-model",
      maxTokens: 4096,
    })),
  } as unknown as LlmProvider;
}

describe("LLM Content Generation", () => {
  describe("generateWikiContent", () => {
    it("should generate wiki content using LLM provider", async () => {
      const mockProvider = createMockLlmProvider();
      const result = await generateWikiContent({
        content: "TypeScript is a strongly typed programming language that builds on JavaScript.",
        filename: "typescript-intro.txt",
        llmProvider: mockProvider,
      });

      expect(result.title).toBe("TypeScript Programming");
      expect(result.summary).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.type).toBe("concept");
      expect(result.crossReferences.length).toBeGreaterThan(0);
      expect(mockProvider.call).toHaveBeenCalled();
    });

    it("should include existing pages in LLM prompt for cross-referencing", async () => {
      await storage.wikiPages.create({
        slug: "javascript",
        title: "JavaScript",
        type: "concept",
        contentPath: "/test/javascript.md",
        tags: ["language", "web"],
        sourceIds: [],
      });

      const mockProvider = createMockLlmProvider();
      const existingPages = await storage.wikiPages.findAll({ limit: 50 });

      await generateWikiContent({
        content: "TypeScript builds on JavaScript.",
        existingPages,
        llmProvider: mockProvider,
      });

      expect(mockProvider.call).toHaveBeenCalled();
    });

    it("should fallback to basic content extraction without LLM provider", async () => {
      const result = await generateWikiContent({
        content: "TypeScript is a strongly typed programming language.",
        filename: "typescript.txt",
        skipLlm: true,
      });

      expect(result.title).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.tags.length).toBeGreaterThanOrEqual(0);
      expect(result.crossReferences.length).toBe(0);
    });

    it("should fallback to basic content when LLM returns invalid JSON", async () => {
      const failingProvider = {
        name: "failing-provider",
        call: vi.fn(async () => ({
          content: "This is not JSON",
          model: "mock-model",
        })),
      } as unknown as LlmProvider;

      const result = await generateWikiContent({
        content: "TypeScript programming language",
        filename: "test.txt",
        llmProvider: failingProvider,
      });

      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it("should fallback to basic content when LLM throws error", async () => {
      const errorProvider = {
        name: "error-provider",
        call: vi.fn(async () => {
          throw new Error("API error");
        }),
      } as unknown as LlmProvider;

      const result = await generateWikiContent({
        content: "TypeScript programming",
        filename: "error-test.txt",
        llmProvider: errorProvider,
      });

      expect(result.title).toBeDefined();
      expect(result.content).toContain("TypeScript");
    });
  });

  describe("generateWikiPageWithLlm", () => {
    it("should generate wiki page from raw content", async () => {
      const mockProvider = createMockLlmProvider();
      const result = await generateWikiPageWithLlm(
        "TypeScript is a strongly typed programming language.",
        { llmProvider: mockProvider }
      );

      expect(result.title).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.type).toBeDefined();
    });

    it("should use filename hint for type inference", async () => {
      const mockProvider = createMockLlmProvider();
      const result = await generateWikiPageWithLlm(
        "Research paper content...",
        { filename: "research-paper.pdf", llmProvider: mockProvider }
      );

      expect(result.type).toBeDefined();
    });
  });

  describe("ingestWithLlm", () => {
    it("should ingest raw resource with LLM-generated content", async () => {
      const contentPath = createRawContentFile(
        "typescript-guide.txt",
        "TypeScript is a strongly typed programming language that builds on JavaScript."
      );

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "typescript-guide.txt",
        contentPath,
      });

      const mockProvider = createMockLlmProvider();
      const result = await ingestWithLlm({
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.rawResourceId).toBe(rawResource.id);
      expect(result.wikiPageId).toBeDefined();
      expect(result.slug).toBeDefined();
      expect(result.title).toBe("TypeScript Programming");
      expect(result.processed).toBe(true);
      expect(result.generatedContent).toBeDefined();
    });

    it("should create wiki page file with LLM-generated content", async () => {
      const contentPath = createRawContentFile(
        "react-hooks.txt",
        "React Hooks are functions that let you use state in functional components."
      );

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "react-hooks.txt",
        contentPath,
      });

      const mockProvider = createMockLlmProvider();
      await ingestWithLlm({
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const pageContent = wikiManager.readPage("concept", "typescript-programming");
      expect(pageContent?.content).toBeDefined();
    });

    it("should update existing wiki page if slug matches", async () => {
      const existingPage = await storage.wikiPages.create({
        slug: "typescript-programming",
        title: "Existing TypeScript",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "typescript-programming"),
        tags: ["existing"],
        sourceIds: ["old-source"],
      });

      wikiManager.createPage({
        title: "Existing TypeScript",
        type: "concept",
        slug: "typescript-programming",
        content: "Old content",
        tags: ["existing"],
        sourceIds: ["old-source"],
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      });

      const contentPath = createRawContentFile(
        "typescript-update.txt",
        "Updated TypeScript content."
      );

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "typescript-update.txt",
        contentPath,
      });

      const mockProvider = createMockLlmProvider();
      const result = await ingestWithLlm({
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.wikiPageId).toBe(existingPage.id);
      const updatedPage = await storage.wikiPages.findById(existingPage.id);
      expect(updatedPage?.sourceIds).toContain(rawResource.id);
    });

    it("should create cross-reference links to existing pages", async () => {
      const existingJsPage = await storage.wikiPages.create({
        slug: "javascript",
        title: "JavaScript",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "javascript"),
        tags: [],
        sourceIds: [],
      });

      const existingProgPage = await storage.wikiPages.create({
        slug: "programming",
        title: "Programming",
        type: "concept",
        contentPath: wikiManager.getPagePath("concept", "programming"),
        tags: [],
        sourceIds: [],
      });

      const contentPath = createRawContentFile(
        "typescript.txt",
        "TypeScript programming content."
      );

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "typescript.txt",
        contentPath,
      });

      const mockProvider = createMockLlmProvider();
      await ingestWithLlm({
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const links = await storage.wikiLinks.findAllLinks();
      const jsLink = links.find(l => l.toPageId === existingJsPage.id);
      const progLink = links.find(l => l.toPageId === existingProgPage.id);

      expect(jsLink || progLink).toBeDefined();
    });

    it("should log LLM generation in processing log", async () => {
      const contentPath = createRawContentFile(
        "test-content.txt",
        "Test content for logging."
      );

      const rawResource = await storage.rawResources.create({
        type: "text",
        filename: "test-content.txt",
        contentPath,
      });

      const mockProvider = createMockLlmProvider();
      await ingestWithLlm({
        rawResourceId: rawResource.id,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const logs = await storage.processingLog.findByOperation("ingest");
      const llmLog = logs.find(l => l.details?.llmGenerated === true);

      expect(llmLog).toBeDefined();
      expect(llmLog?.details?.crossReferences).toBeDefined();
    });
  });
});

describe("Real LLM Integration", () => {
  it("should generate wiki content with real LLM provider", async () => {
    const config = loadLlmConfig();

    if (!config) {
      console.log("Skipping: LLM config not available");
      return;
    }

    const provider = new LlmProvider(config);
    const result = await generateWikiContent({
      content: `Vite is a modern build tool for web development. It provides fast development server with Hot Module Replacement (HMR), optimized production builds using Rollup, and supports TypeScript, JSX, and CSS out of the box. Vite was created by Evan You, the creator of Vue.js.`,
      filename: "vite-intro.txt",
      llmProvider: provider,
    });

    expect(result.title).toBeDefined();
    expect(result.title.length).toBeGreaterThan(3);
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(10);
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(50);
    expect(result.tags.length).toBeGreaterThan(0);
    expect(result.type).toBeDefined();
  }, 30000);

  it("should ingest and generate wiki page with real LLM", async () => {
    const config = loadLlmConfig();

    if (!config) {
      console.log("Skipping: LLM config not available");
      return;
    }

    const contentPath = createRawContentFile(
      "bun-runtime.txt",
      `Bun is a fast JavaScript runtime and toolkit. It serves as a drop-in replacement for Node.js, offering significantly faster startup times and built-in APIs for testing, bundling, and package management. Bun uses JavaScriptCore engine instead of V8.`
    );

    const rawResource = await storage.rawResources.create({
      type: "text",
      filename: "bun-runtime.txt",
      contentPath,
    });

    const provider = new LlmProvider(config);
    const result = await ingestWithLlm({
      rawResourceId: rawResource.id,
      wikiFileManager: getTestWikiManager(),
      llmProvider: provider,
    });

    expect(result.processed).toBe(true);
    expect(result.generatedContent.title).toBeDefined();
    expect(result.generatedContent.summary).toBeDefined();
    expect(result.generatedContent.content.length).toBeGreaterThan(100);
    expect(result.generatedContent.tags.length).toBeGreaterThan(0);
  }, 60000);
});
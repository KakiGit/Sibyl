import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "./ingest.js";
import { synthesizeAnswer, queryWiki } from "./query.js";
import { LlmProvider } from "../llm/provider.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-synthesize-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");
  testRawDir = join(testDbDir, "raw");

  mkdirSync(join(testRawDir, "documents"), { recursive: true });

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

function createRawContentFile(filename: string, content: string): string {
  const filePath = join(testRawDir, "documents", filename);
  writeFileSync(filePath, content);
  return filePath;
}

function getTestWikiManager(): WikiFileManager {
  return wikiManager;
}

async function setupWikiPages() {
  const pages = [
    {
      filename: "react-overview.txt",
      content: "React is a JavaScript library for building user interfaces. It was created by Facebook and is widely used for single-page applications. React uses a component-based architecture where UI elements are broken down into reusable pieces. Key features include virtual DOM for efficient rendering, JSX for combining JavaScript and HTML, and hooks for state management in functional components.",
      type: "concept",
    },
    {
      filename: "hooks-guide.txt",
      content: "Hooks are functions that let you use state and other React features in functional components. useState manages local component state. useEffect handles side effects like data fetching or subscriptions. useMemo and useCallback optimize performance by memoizing values and functions. Custom hooks allow you to extract and share component logic.",
      type: "concept",
    },
    {
      filename: "components-patterns.txt",
      content: "React components can be functional or class-based. Functional components with hooks are now the recommended approach. Common patterns include: presentational vs container components, higher-order components (HOCs), render props, and compound components. Components should be kept small and focused on a single responsibility.",
      type: "concept",
    },
  ];

  for (const page of pages) {
    const contentPath = createRawContentFile(page.filename, page.content);
    const raw = await storage.rawResources.create({
      type: "text",
      filename: page.filename,
      contentPath,
    });
    await ingestRawResource({
      rawResourceId: raw.id,
      type: page.type as "concept",
      wikiFileManager: getTestWikiManager(),
    });
  }
}

function createMockLlmProvider(): LlmProvider {
  return {
    name: "mock-provider",
    call: vi.fn(async (systemPrompt: string, userPrompt: string) => {
      return {
        content: `# React Hooks Overview

Based on the wiki pages provided:

## What are React Hooks?

Hooks are functions that let you use state and other React features in functional components [[hooks-guide]].

## Key Features

According to [[react-overview]], React uses a component-based architecture with hooks for state management. The main hooks include:

- **useState**: Manages local component state [[hooks-guide]]
- **useEffect**: Handles side effects like data fetching [[hooks-guide]]
- **useMemo/useCallback**: Performance optimization tools [[hooks-guide]]

## Component Patterns

As described in [[components-patterns]], functional components with hooks are now the recommended approach over class-based components.

This synthesis demonstrates how hooks integrate with React's component architecture.`,
        model: "mock-model",
        usage: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
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

describe("Synthesize Answer", () => {
  describe("synthesizeAnswer", () => {
    it("should synthesize answer using LLM provider", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      const result = await synthesizeAnswer({
        query: "What are React hooks?",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.query).toBe("What are React hooks?");
      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(100);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.model).toBe("mock-model");
      expect(mockProvider.call).toHaveBeenCalled();
    });

    it("should return citations for referenced pages", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      const result = await synthesizeAnswer({
        query: "React hooks explanation",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.citations).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations[0].pageSlug).toBeDefined();
      expect(result.citations[0].pageTitle).toBeDefined();
      expect(result.citations[0].pageType).toBeDefined();
      expect(result.citations[0].relevanceScore).toBeDefined();
    });

    it("should fallback to basic summary without LLM provider", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React hooks",
        wikiFileManager: getTestWikiManager(),
        llmProvider: null,
      });

      expect(result.query).toBe("React hooks");
      expect(result.answer).toBeDefined();
      expect(result.answer).toContain("Answer Summary");
      expect(result.answer).toContain("LLM integration");
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.model).toBeUndefined();
    });

    it("should return message when no wiki pages found", async () => {
      const result = await synthesizeAnswer({
        query: "nonexistent topic xyzabc",
        wikiFileManager: getTestWikiManager(),
        llmProvider: createMockLlmProvider(),
      });

      expect(result.answer).toContain("No relevant wiki pages found");
      expect(result.citations.length).toBe(0);
    });

    it("should respect maxPages parameter", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      const result = await synthesizeAnswer({
        query: "React",
        maxPages: 2,
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.citations.length).toBeLessThanOrEqual(2);
    });

    it("should filter by types", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      const result = await synthesizeAnswer({
        query: "React",
        types: ["concept"],
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      expect(result.citations.every((c) => c.pageType === "concept")).toBe(true);
    });

    it("should throw error for empty query", async () => {
      await expect(
        synthesizeAnswer({
          query: "",
          wikiFileManager: getTestWikiManager(),
          llmProvider: createMockLlmProvider(),
        })
      ).rejects.toThrow("Query string is required");
    });

    it("should create processing log entry with synthesis details", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      await synthesizeAnswer({
        query: "React components",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const logs = await storage.processingLog.findByOperation("query");
      const synthesisLog = logs.find((l) => l.details?.synthesized === true);

      expect(synthesisLog).toBeDefined();
      expect(synthesisLog?.details?.model).toBe("mock-model");
      expect(synthesisLog?.details?.citationsCount).toBeDefined();
    });

    it("should append synthesis to wiki log file", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      await synthesizeAnswer({
        query: "React patterns",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const logEntries = getTestWikiManager().readLog();
      const synthesisEntry = logEntries.find(
        (e) => e.operation === "query" && e.title.includes("LLM Synthesis")
      );

      expect(synthesisEntry).toBeDefined();
      expect(synthesisEntry?.details).toContain("mock-model");
    });

    it("should include synthesizedAt timestamp", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React",
        wikiFileManager: getTestWikiManager(),
        llmProvider: createMockLlmProvider(),
      });

      expect(result.synthesizedAt).toBeDefined();
      expect(result.synthesizedAt).toBeGreaterThan(0);
    });
  });

  describe("LLM Provider Integration", () => {
    it("should call LLM with proper system prompt", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      await synthesizeAnswer({
        query: "React hooks",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const callMock = mockProvider.call as ReturnType<typeof vi.fn>;
      expect(callMock).toHaveBeenCalled();

      const [systemPrompt, userPrompt] = callMock.mock.calls[0];
      expect(systemPrompt).toContain("knowledge synthesis");
      expect(systemPrompt).toContain("[[page-slug]]");
      expect(userPrompt).toContain("React hooks");
    });

    it("should include wiki content in user prompt", async () => {
      await setupWikiPages();

      const mockProvider = createMockLlmProvider();
      await synthesizeAnswer({
        query: "React hooks",
        wikiFileManager: getTestWikiManager(),
        llmProvider: mockProvider,
      });

      const callMock = mockProvider.call as ReturnType<typeof vi.fn>;
      const [_, userPrompt] = callMock.mock.calls[0];

      expect(userPrompt).toContain("Available wiki pages");
      expect(userPrompt).toContain("[[react-overview]]");
      expect(userPrompt).toContain("Content:");
    });
  });

  describe("Fallback Behavior", () => {
    it("should generate basic summary with wiki links", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React",
        wikiFileManager: getTestWikiManager(),
        llmProvider: null,
      });

      expect(result.answer).toContain("[[");
      expect(result.answer).toContain("## [[");
    });

    it("should include content previews in basic summary", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "hooks",
        wikiFileManager: getTestWikiManager(),
        llmProvider: null,
      });

      expect(result.answer.length).toBeGreaterThan(200);
    });
  });

  describe("Error Handling", () => {
    it("should handle LLM provider errors gracefully", async () => {
      await setupWikiPages();

      const failingProvider = {
        name: "failing-provider",
        call: vi.fn(async () => {
          throw new Error("API connection failed");
        }),
      } as unknown as LlmProvider;

      await expect(
        synthesizeAnswer({
          query: "React",
          wikiFileManager: getTestWikiManager(),
          llmProvider: failingProvider,
        })
      ).rejects.toThrow("API connection failed");
    });

    it("should still work without provider after error", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React",
        wikiFileManager: getTestWikiManager(),
        llmProvider: null,
      });

      expect(result.answer).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
    });
  });
});
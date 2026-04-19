import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "./ingest.js";
import { synthesizeAnswer, queryWiki } from "./query.js";
import { LlmProvider, resetLlmProvider } from "../llm/provider.js";

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
        skipLlm: true,
      });

      expect(result.query).toBe("React hooks");
      expect(result.answer).toBeDefined();
      expect(result.answer).toContain("Answer Summary");
      expect(result.answer).toContain("LLM integration");
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.model).toBeUndefined();
    });

    it("should still work without provider after error", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React",
        wikiFileManager: getTestWikiManager(),
        skipLlm: true,
      });

      expect(result.answer).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
    });
  });

  describe("Fallback Behavior", () => {
    it("should generate basic summary when no LLM provider available", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "React",
        wikiFileManager: getTestWikiManager(),
        skipLlm: true,
      });

      expect(result.answer).toBeDefined();
      expect(result.answer).toContain("[[");
      expect(result.answer).toContain("## [[");
    });

    it("should include content previews in basic summary", async () => {
      await setupWikiPages();

      const result = await synthesizeAnswer({
        query: "hooks",
        wikiFileManager: getTestWikiManager(),
        skipLlm: true,
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
  });
});
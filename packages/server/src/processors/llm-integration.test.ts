import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "./ingest.js";
import { synthesizeAnswer } from "./query.js";
import { getLlmProvider, loadLlmConfig, resetLlmProvider, LlmProvider } from "../llm/index.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let testRawDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-llm-test-${Date.now()}`);
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
      filename: "typescript-basics.txt",
      content: `TypeScript is a strongly typed programming language that builds on JavaScript. It adds static type definitions and compile-time type checking. TypeScript was created by Microsoft and has become one of the most popular languages for web development.

Key features include:
- Static typing with type inference
- Interfaces and type aliases
- Classes with inheritance
- Generics for reusable code
- Union and intersection types
- Nullish coalescing and optional chaining

TypeScript compiles to plain JavaScript and can run in any JavaScript environment. It helps catch errors during development rather than at runtime.`,
      type: "concept",
    },
    {
      filename: "react-hooks.txt",
      content: `React Hooks are functions that allow you to use React state and lifecycle features in functional components. The most common hooks are:

useState - Manages local component state. Returns a state value and a setter function.
useEffect - Handles side effects like data fetching, subscriptions, or DOM manipulation.
useContext - Accesses context values without nesting.
useMemo - Memoizes computed values to optimize performance.
useCallback - Memoizes callback functions.

Hooks make component logic more reusable and easier to test. They replaced the older class component patterns in modern React development.`,
      type: "concept",
    },
    {
      filename: "nodejs-intro.txt",
      content: `Node.js is a JavaScript runtime built on Chrome's V8 engine. It enables running JavaScript outside the browser, primarily for server-side applications.

Node.js uses an event-driven, non-blocking I/O model which makes it efficient for real-time applications. It has a rich ecosystem through npm (Node Package Manager), which hosts millions of packages.

Common uses include:
- Web servers and REST APIs
- Real-time applications (chat, gaming)
- Microservices architecture
- CLI tools and scripts
- Build tools and automation`,
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

describe("Real LLM Integration", () => {
  describe("LLM Configuration", () => {
    it("should load LLM config from ~/.llm_secrets", () => {
      const config = loadLlmConfig();
      
      if (config) {
        expect(config.baseUrl).toBeDefined();
        expect(config.apiKey).toBeDefined();
        expect(config.model).toBeDefined();
        expect(config.baseUrl).toContain("coding.dashscope.aliyuncs.com");
        expect(config.model).toBe("glm-5");
      } else {
        console.log("LLM config not available - skipping real integration tests");
      }
    });

    it("should create LlmProvider with loaded config", () => {
      const config = loadLlmConfig();
      
      if (config) {
        const provider = new LlmProvider(config);
        expect(provider.name).toBe("openai-compatible");
        expect(provider.getConfig()).toEqual(config);
      }
    });

    it("should get cached LlmProvider instance", () => {
      const config = loadLlmConfig();
      
      if (config) {
        const provider1 = getLlmProvider();
        const provider2 = getLlmProvider();
        
        expect(provider1).not.toBeNull();
        expect(provider2).not.toBeNull();
        expect(provider1).toBe(provider2);
      }
    });
  });

  describe("LLM API Call", () => {
    it("should make successful API call to LLM", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      const provider = new LlmProvider(config);
      
      const response = await provider.call(
        "You are a helpful assistant. Answer briefly.",
        "What is TypeScript?"
      );

      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(10);
      expect(response.model).toBe(config.model);
      expect(response.usage).toBeDefined();
      expect(response.usage?.promptTokens).toBeGreaterThan(0);
      expect(response.usage?.completionTokens).toBeGreaterThan(0);
      expect(response.usage?.totalTokens).toBeGreaterThan(0);
    }, 30000);

    it("should handle complex prompt", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      const provider = new LlmProvider(config);
      
      const response = await provider.call(
        "You are a knowledge synthesis assistant. Provide detailed technical answers.",
        "Explain the relationship between TypeScript, React, and Node.js in modern web development."
      );

      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(100);
    }, 90000);
  });

  describe("Synthesize Answer with Real LLM", () => {
    it("should synthesize answer from wiki pages using real LLM", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      await setupWikiPages();

      const provider = new LlmProvider(config);
      const result = await synthesizeAnswer({
        query: "What are TypeScript and React hooks?",
        wikiFileManager: getTestWikiManager(),
        llmProvider: provider,
        maxPages: 3,
      });

      expect(result.query).toBe("What are TypeScript and React hooks?");
      expect(result.answer).toBeDefined();
      expect(result.answer.length).toBeGreaterThan(100);
      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.model).toBe(config.model);
      expect(result.synthesizedAt).toBeDefined();

      const hasTypeScriptCitation = result.citations.some(
        c => c.pageSlug === "typescript-basics"
      );
      const hasHooksCitation = result.citations.some(
        c => c.pageSlug === "react-hooks"
      );
      
      expect(hasTypeScriptCitation || hasHooksCitation).toBe(true);
    }, 60000);

    it("should include wiki citations in synthesized answer", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      await setupWikiPages();

      const provider = new LlmProvider(config);
      const result = await synthesizeAnswer({
        query: "Explain TypeScript features",
        wikiFileManager: getTestWikiManager(),
        llmProvider: provider,
      });

      expect(result.answer).toBeDefined();
      expect(result.citations.length).toBeGreaterThan(0);
      
      const typescriptCitation = result.citations.find(
        c => c.pageSlug === "typescript-basics"
      );
      
      expect(typescriptCitation).toBeDefined();
      expect(typescriptCitation?.pageTitle).toBe("Typescript Basics");
      expect(typescriptCitation?.pageType).toBe("concept");
      expect(typescriptCitation?.relevanceScore).toBeGreaterThan(0);
    }, 60000);

    it("should create processing log with LLM usage stats", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      await setupWikiPages();

      const provider = new LlmProvider(config);
      await synthesizeAnswer({
        query: "Node.js and TypeScript",
        wikiFileManager: getTestWikiManager(),
        llmProvider: provider,
      });

      const logs = await storage.processingLog.findByOperation("query");
      const synthesisLog = logs.find(l => l.details?.synthesized === true);

      expect(synthesisLog).toBeDefined();
      expect(synthesisLog?.details?.model).toBe(config.model);
      expect(synthesisLog?.details?.promptTokens).toBeGreaterThan(0);
      expect(synthesisLog?.details?.completionTokens).toBeGreaterThan(0);
    }, 60000);

    it("should answer question about specific wiki content", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      await setupWikiPages();

      const provider = new LlmProvider(config);
      const result = await synthesizeAnswer({
        query: "What are the key features of useState and useEffect hooks?",
        wikiFileManager: getTestWikiManager(),
        llmProvider: provider,
      });

      expect(result.answer).toBeDefined();
      expect(result.answer.toLowerCase()).toContain("state");
      expect(result.answer.toLowerCase()).toContain("effect");
      
      const hooksCitation = result.citations.find(
        c => c.pageSlug === "react-hooks"
      );
      expect(hooksCitation).toBeDefined();
    }, 60000);

    it("should handle query with no matching wiki pages", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      const result = await synthesizeAnswer({
        query: "nonexistent topic xyzabc programming",
        wikiFileManager: getTestWikiManager(),
        llmProvider: new LlmProvider(config),
      });

      expect(result.answer).toContain("No relevant wiki pages found");
      expect(result.citations.length).toBe(0);
    }, 30000);
  });

  describe("Full Integration Workflow", () => {
    it("should complete ingest -> query -> synthesize workflow with real LLM", async () => {
      const config = loadLlmConfig();
      
      if (!config) {
        console.log("Skipping: LLM config not available");
        return;
      }

      const contentPath = createRawContentFile(
        "vite-config.txt",
        `Vite is a modern build tool for web development. It provides:
- Fast development server with Hot Module Replacement (HMR)
- Optimized production builds using Rollup
- Support for TypeScript, JSX, and CSS out of the box
- Plugin system for extending functionality
- Native ES modules during development

Vite was created by Evan You, the creator of Vue.js. It works well with React, Vue, and other frameworks.`
      );

      const raw = await storage.rawResources.create({
        type: "text",
        filename: "vite-config.txt",
        contentPath,
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: raw.id,
        type: "concept",
        wikiFileManager: getTestWikiManager(),
      });

      expect(ingestResult.processed).toBe(true);
      expect(ingestResult.slug).toBe("vite-config");

      const provider = new LlmProvider(config);
      const synthesizeResult = await synthesizeAnswer({
        query: "What is Vite and what features does it provide?",
        wikiFileManager: getTestWikiManager(),
        llmProvider: provider,
      });

      expect(synthesizeResult.answer).toBeDefined();
      expect(synthesizeResult.answer.length).toBeGreaterThan(50);
      expect(synthesizeResult.citations.length).toBeGreaterThan(0);
      
      const viteCitation = synthesizeResult.citations.find(
        c => c.pageSlug === "vite-config"
      );
      expect(viteCitation).toBeDefined();
    }, 60000);
  });
});
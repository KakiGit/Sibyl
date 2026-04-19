import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { 
  createDatabase, 
  migrateDatabase, 
  closeDatabase, 
  setDatabase,
  WikiFileManager,
  getLlmProvider,
  resetLlmProvider
} from "./index.js";
import { storage } from "./storage/index.js";
import { synthesizeAnswer } from "./processors/query.js";

let testDbDir: string;
let testDbPath: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-llm-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");

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

async function createWikiPage(
  slug: string,
  title: string,
  type: "entity" | "concept" | "source" | "summary",
  content: string
): Promise<void> {
  const now = Date.now();
  wikiManager.createPage({
    title,
    type,
    slug,
    content,
    tags: [],
    sourceIds: [],
    createdAt: now,
    updatedAt: now,
  });

  await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiManager.getPagePath(type, slug),
    tags: [],
    sourceIds: [],
  });
}

describe("LLM Integration", () => {
  it("should load LLM config from secrets file", () => {
    const provider = getLlmProvider();
    if (provider) {
      expect(provider.name).toBeDefined();
      const config = provider.getConfig();
      expect(config.baseUrl).toBeDefined();
      expect(config.apiKey).toBeDefined();
      expect(config.model).toBeDefined();
    } else {
      console.log("LLM secrets not found - skipping provider test");
    }
  });

  it("should synthesize answer using LLM", async () => {
    const provider = getLlmProvider();
    if (!provider) {
      console.log("LLM secrets not found - skipping synthesis test");
      return;
    }

    await createWikiPage(
      "machine-learning",
      "Machine Learning",
      "concept",
      "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed."
    );

    await createWikiPage(
      "artificial-intelligence",
      "Artificial Intelligence",
      "concept",
      "Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans and animals."
    );

    const result = await synthesizeAnswer({
      query: "What is artificial intelligence?",
      maxPages: 2,
      wikiFileManager: wikiManager,
      skipLlm: false,
    });

    expect(result.query).toBe("What is artificial intelligence?");
    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(10);
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.model).toBeDefined();
  }, 30000);

  it("should handle synthesis without LLM provider", async () => {
    resetLlmProvider();

    await createWikiPage(
      "test-page",
      "Test Page",
      "concept",
      "This is a test page for synthesis without LLM."
    );

    const result = await synthesizeAnswer({
      query: "test",
      maxPages: 1,
      wikiFileManager: wikiManager,
      skipLlm: true,
    });

    expect(result.query).toBe("test");
    expect(result.answer).toBeDefined();
    expect(result.model).toBeUndefined();
  });
});
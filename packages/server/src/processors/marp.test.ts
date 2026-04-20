import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateMarpSlides, splitContentIntoSlides, convertWikiToMarp } from "./marp.js";
import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { createDatabase, closeDatabase, setDatabase, migrateDatabase } from "../database.js";
import { LlmProvider, resetLlmProvider } from "../llm/index.js";
import { resolve } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync } from "fs";

let testDbPath: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  resetLlmProvider();
  testDbPath = resolve(tmpdir(), `sibyl-marp-test-${Date.now()}.db`);
  const testWikiPath = resolve(tmpdir(), `sibyl-marp-wiki-${Date.now()}`);
  mkdirSync(testWikiPath, { recursive: true });
  mkdirSync(resolve(testWikiPath, "entities"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "concepts"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "sources"), { recursive: true });
  mkdirSync(resolve(testWikiPath, "summaries"), { recursive: true });

  wikiManager = new WikiFileManager(testWikiPath);

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);
});

afterEach(async () => {
  closeDatabase();
  resetLlmProvider();
  try {
    rmSync(testDbPath, { force: true });
  } catch {}
});

describe("splitContentIntoSlides", () => {
  it("should split content with multiple headings into slides", () => {
    const content = `# Introduction

This is the introduction content.

# Features

- Feature 1
- Feature 2

# Conclusion

The conclusion.`;

    const slides = splitContentIntoSlides(content, "Test Deck");

    expect(slides.length).toBe(3);
    expect(slides[0].title).toBe("Introduction");
    expect(slides[1].title).toBe("Features");
    expect(slides[2].title).toBe("Conclusion");
  });

  it("should handle content without headings", () => {
    const content = "Just some bullet points\n- Point 1\n- Point 2";
    const slides = splitContentIntoSlides(content, "Test");

    expect(slides.length).toBe(1);
    expect(slides[0].title).toBe("Test");
    expect(slides[0].content).toContain("Point 1");
  });

  it("should handle ## subheadings", () => {
    const content = `# Main Title

Content here.

## Subsection

More content.`;

    const slides = splitContentIntoSlides(content, "Main Title");

    expect(slides.length).toBeGreaterThanOrEqual(1);
    expect(slides[0].title).toBe("Main Title");
  });
});

describe("convertWikiToMarp", () => {
  it("should generate valid Marp markdown", () => {
    const slides = [
      { title: "Intro", content: "Welcome to the deck" },
      { title: "Features", content: "- Feature A\n- Feature B" },
    ];

    const marp = convertWikiToMarp(slides, "default", true, "My Presentation");

    expect(marp).toContain("marp: true");
    expect(marp).toContain("theme: default");
    expect(marp).toContain("paginate: true");
    expect(marp).toContain("# My Presentation");
    expect(marp).toContain("---");
    expect(marp).toContain("# Intro");
    expect(marp).toContain("# Features");
  });

  it("should support different themes", () => {
    const slides = [{ title: "Test", content: "Content" }];
    const marp = convertWikiToMarp(slides, "gaia", true, "Test Deck");

    expect(marp).toContain("theme: gaia");
  });

  it("should disable pagination when paginate is false", () => {
    const slides = [{ title: "Test", content: "Content" }];
    const marp = convertWikiToMarp(slides, "default", false, "Test");

    expect(marp).toContain("paginate: false");
  });
});

describe("generateMarpSlides", () => {
  it("should generate slides from wiki pages by slugs", async () => {
    const page = await storage.wikiPages.create({
      slug: "test-concept",
      title: "Test Concept",
      type: "concept",
      contentPath: wikiManager.getPagePath("concept", "test-concept"),
      summary: "A test concept",
      tags: ["test"],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "Test Concept",
      type: "concept",
      slug: "test-concept",
      content: `# Overview

This is a test concept.

# Details

- Point 1
- Point 2`,
      summary: "A test concept",
      tags: ["test"],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await generateMarpSlides({
      pageSlugs: ["test-concept"],
      title: "Test Presentation",
      theme: "default",
      paginate: true,
    });

    expect(result.title).toBe("Test Presentation");
    expect(result.theme).toBe("default");
    expect(result.slides.length).toBeGreaterThan(0);
    expect(result.marpContent).toContain("marp: true");
    expect(result.sourcePages.length).toBe(1);
    expect(result.sourcePages[0].slug).toBe("test-concept");
  });

  it("should generate slides from wiki pages by ids", async () => {
    const page = await storage.wikiPages.create({
      slug: "test-entity",
      title: "Test Entity",
      type: "entity",
      contentPath: wikiManager.getPagePath("entity", "test-entity"),
      summary: "A test entity",
      tags: [],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "Test Entity",
      type: "entity",
      slug: "test-entity",
      content: "# Entity Info\n\nEntity description.",
      summary: "A test entity",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await generateMarpSlides({
      pageIds: [page.id],
      title: "Entity Presentation",
    });

    expect(result.sourcePages.length).toBe(1);
    expect(result.sourcePages[0].id).toBe(page.id);
  });

  it("should generate slides from query search", async () => {
    await storage.wikiPages.create({
      slug: "react-overview",
      title: "React Overview",
      type: "concept",
      contentPath: wikiManager.getPagePath("concept", "react-overview"),
      summary: "React is a JavaScript library",
      tags: ["react", "frontend"],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "React Overview",
      type: "concept",
      slug: "react-overview",
      content: "# React\n\nReact is a JavaScript library for building UIs.",
      summary: "React is a JavaScript library",
      tags: ["react", "frontend"],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await generateMarpSlides({
      query: "React",
      title: "React Presentation",
      maxPages: 5,
    });

    expect(result.slides.length).toBeGreaterThan(0);
    expect(result.marpContent).toContain("React");
  });

  it("should throw error when no pages found", async () => {
    await expect(
      generateMarpSlides({
        pageSlugs: ["non-existent"],
      })
    ).rejects.toThrow("No wiki pages found");
  });

  it("should use LLM when useLlm is true with mock provider", async () => {
    const mockLlmProvider = {
      call: async () => ({
        content: `---
# Generated Title

Content from LLM.

---
# Second Slide

More content.`,
        model: "test-model",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      }),
      name: "mock",
    } as unknown as LlmProvider;

    await storage.wikiPages.create({
      slug: "ai-topic",
      title: "AI Topic",
      type: "concept",
      contentPath: wikiManager.getPagePath("concept", "ai-topic"),
      summary: "About AI",
      tags: [],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "AI Topic",
      type: "concept",
      slug: "ai-topic",
      content: "# AI\n\nArtificial Intelligence overview.",
      summary: "About AI",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await generateMarpSlides({
      pageSlugs: ["ai-topic"],
      useLlm: true,
      llmProvider: mockLlmProvider,
      title: "AI Presentation",
    });

    expect(result.slides.length).toBeGreaterThan(0);
    expect(result.marpContent).toContain("Generated Title");
  });

  it("should throw error when useLlm is true but no LLM provider", async () => {
    resetLlmProvider();

    await storage.wikiPages.create({
      slug: "no-llm-test",
      title: "No LLM Test",
      type: "concept",
      contentPath: wikiManager.getPagePath("concept", "no-llm-test"),
      summary: "Test",
      tags: [],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "No LLM Test",
      type: "concept",
      slug: "no-llm-test",
      content: "Test content",
      summary: "Test",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      generateMarpSlides({
        pageSlugs: ["no-llm-test"],
        useLlm: true,
        llmProvider: null,
        skipDefaultLlm: true,
      })
    ).rejects.toThrow("LLM provider not configured");
  });

  it("should filter pages by type", async () => {
    await storage.wikiPages.create({
      slug: "entity-test",
      title: "Entity Test",
      type: "entity",
      contentPath: wikiManager.getPagePath("entity", "entity-test"),
      summary: "Entity",
      tags: [],
      sourceIds: [],
    });

    await storage.wikiPages.create({
      slug: "concept-test",
      title: "Concept Test",
      type: "concept",
      contentPath: wikiManager.getPagePath("concept", "concept-test"),
      summary: "Concept",
      tags: [],
      sourceIds: [],
    });

    wikiManager.createPage({
      title: "Entity Test",
      type: "entity",
      slug: "entity-test",
      content: "Entity content",
      summary: "Entity",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    wikiManager.createPage({
      title: "Concept Test",
      type: "concept",
      slug: "concept-test",
      content: "Concept content",
      summary: "Concept",
      tags: [],
      sourceIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await generateMarpSlides({
      type: "entity",
      maxPages: 10,
    });

    expect(result.sourcePages.every((p) => p.type === "entity")).toBe(true);
  });
});
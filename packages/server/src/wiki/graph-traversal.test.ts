import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { tmpdir } from "os";
import { mkdirSync, rmSync, existsSync } from "fs";
import {
  createDatabase,
  closeDatabase,
  setDatabase,
  migrateDatabase,
  storage,
} from "../index.js";
import {
  getLinkCounts,
  computeHubScore,
  getNeighborPageIds,
  getNeighborPageIdsBatch,
  enrichMatchesWithGraph,
  getNeighborSummaries,
  invalidateLinkCountsCache,
} from "./graph-traversal.js";
import type { WikiPage } from "@sibyl/sdk";

let testDbDir: string;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-graph-traversal-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  const db = createDatabase(join(testDbDir, "test.db"));
  migrateDatabase(db);
  setDatabase(db);
  invalidateLinkCountsCache();
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

describe("getLinkCounts", () => {
  it("should return empty map when no links exist", async () => {
    const counts = await getLinkCounts();
    expect(counts.size).toBe(0);
  });

  it("should count incoming and outgoing links", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });
    const page3 = await storage.wikiPages.create({
      slug: "page-3",
      title: "Page 3",
      type: "concept",
      contentPath: "/test/page-3.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page3.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page2.id,
      toPageId: page3.id,
      relationType: "references",
    });

    invalidateLinkCountsCache();
    const counts = await getLinkCounts();

    expect(counts.get(page1.id)?.outgoing).toBe(2);
    expect(counts.get(page1.id)?.incoming).toBe(0);
    expect(counts.get(page2.id)?.outgoing).toBe(1);
    expect(counts.get(page2.id)?.incoming).toBe(1);
    expect(counts.get(page3.id)?.outgoing).toBe(0);
    expect(counts.get(page3.id)?.incoming).toBe(2);
  });

  it("should cache link counts", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const counts1 = await getLinkCounts();
    const counts2 = await getLinkCounts();

    expect(counts1).toBe(counts2);
  });
});

describe("computeHubScore", () => {
  it("should return 0 for pages with no links", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });

    const counts = await getLinkCounts();
    const score = computeHubScore(page1.id, counts);

    expect(score).toBe(0);
  });

  it("should return normalized score based on max links", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });
    const page3 = await storage.wikiPages.create({
      slug: "page-3",
      title: "Page 3",
      type: "concept",
      contentPath: "/test/page-3.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page3.id,
      toPageId: page1.id,
      relationType: "references",
    });

    invalidateLinkCountsCache();
    const counts = await getLinkCounts();

    const score1 = computeHubScore(page1.id, counts);
    expect(score1).toBe(1);

    const score2 = computeHubScore(page2.id, counts);
    expect(score2).toBe(0.5);

    const score3 = computeHubScore(page3.id, counts);
    expect(score3).toBe(0.5);
  });
});

describe("getNeighborPageIds", () => {
  it("should return empty array for page with no links", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });

    const neighbors = await getNeighborPageIds(page1.id);
    expect(neighbors).toEqual([]);
  });

  it("should return outgoing neighbors", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const neighbors = await getNeighborPageIds(page1.id, "out");
    expect(neighbors).toEqual([page2.id]);
  });

  it("should return incoming neighbors", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const neighbors = await getNeighborPageIds(page2.id, "in");
    expect(neighbors).toEqual([page1.id]);
  });

  it("should return both incoming and outgoing neighbors", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });
    const page3 = await storage.wikiPages.create({
      slug: "page-3",
      title: "Page 3",
      type: "concept",
      contentPath: "/test/page-3.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page3.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const neighbors = await getNeighborPageIds(page2.id, "both");
    expect(neighbors).toContain(page1.id);
    expect(neighbors).toContain(page3.id);
  });

  it("should limit number of neighbors", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });
    const page3 = await storage.wikiPages.create({
      slug: "page-3",
      title: "Page 3",
      type: "concept",
      contentPath: "/test/page-3.md",
    });
    const page4 = await storage.wikiPages.create({
      slug: "page-4",
      title: "Page 4",
      type: "concept",
      contentPath: "/test/page-4.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page3.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page4.id,
      relationType: "references",
    });

    const neighbors = await getNeighborPageIds(page1.id, "both", 2);
    expect(neighbors.length).toBe(2);
  });
});

describe("getNeighborPageIdsBatch", () => {
  it("should return empty map for empty input", async () => {
    const result = await getNeighborPageIdsBatch([]);
    expect(result.size).toBe(0);
  });

  it("should return neighbors for multiple pages", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });
    const page3 = await storage.wikiPages.create({
      slug: "page-3",
      title: "Page 3",
      type: "concept",
      contentPath: "/test/page-3.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page3.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const result = await getNeighborPageIdsBatch([page1.id, page2.id, page3.id]);

    expect(result.get(page1.id)).toEqual([page2.id]);
    expect(result.get(page2.id)).toContain(page1.id);
    expect(result.get(page2.id)).toContain(page3.id);
    expect(result.get(page3.id)).toEqual([page2.id]);
  });
});

describe("enrichMatchesWithGraph", () => {
  it("should boost relevance scores for hub pages", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    invalidateLinkCountsCache();

    const matches = [
      { page: page1, relevanceScore: 100, matchType: "title" as const },
      { page: page2, relevanceScore: 50, matchType: "summary" as const },
    ];

    const enriched = await enrichMatchesWithGraph(matches, { hubBoostWeight: 0.3 });

    expect(enriched[0].page.id).toBe(page1.id);
    expect(enriched[0].relevanceScore).toBeGreaterThan(100);
    expect(enriched[0].isExpanded).toBe(false);
  });

  it("should expand results with neighbor pages", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    invalidateLinkCountsCache();

    const matches = [
      { page: page1, relevanceScore: 100, matchType: "title" as const },
    ];

    const enriched = await enrichMatchesWithGraph(matches);

    expect(enriched.length).toBeGreaterThan(1);
    const expandedPages = enriched.filter((e) => e.isExpanded);
    expect(expandedPages.length).toBeGreaterThan(0);
    expect(expandedPages[0].expandedFrom).toBe(page1.id);
    expect(expandedPages[0].matchType).toBe("expanded");
  });

  it("should not duplicate pages", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });
    await storage.wikiLinks.create({
      fromPageId: page2.id,
      toPageId: page1.id,
      relationType: "references",
    });

    invalidateLinkCountsCache();

    const matches = [
      { page: page1, relevanceScore: 100, matchType: "title" as const },
      { page: page2, relevanceScore: 80, matchType: "summary" as const },
    ];

    const enriched = await enrichMatchesWithGraph(matches);

    const pageIds = enriched.map((e) => e.page.id);
    const uniqueIds = new Set(pageIds);
    expect(uniqueIds.size).toBe(pageIds.length);
  });
});

describe("getNeighborSummaries", () => {
  it("should return summaries of neighbor pages", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
      summary: "Summary of page 1",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
      summary: "Summary of page 2",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const summaries = await getNeighborSummaries([page1.id]);

    expect(summaries.length).toBe(1);
    expect(summaries[0].page.id).toBe(page2.id);
    expect(summaries[0].summary).toBe("Summary of page 2");
  });

  it("should not include pages without summaries", async () => {
    const page1 = await storage.wikiPages.create({
      slug: "page-1",
      title: "Page 1",
      type: "concept",
      contentPath: "/test/page-1.md",
      summary: "Summary of page 1",
    });
    const page2 = await storage.wikiPages.create({
      slug: "page-2",
      title: "Page 2",
      type: "concept",
      contentPath: "/test/page-2.md",
    });

    await storage.wikiLinks.create({
      fromPageId: page1.id,
      toPageId: page2.id,
      relationType: "references",
    });

    const summaries = await getNeighborSummaries([page1.id]);

    expect(summaries.length).toBe(0);
  });
});
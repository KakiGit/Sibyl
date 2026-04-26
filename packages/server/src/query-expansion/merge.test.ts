import { describe, it, expect } from "vitest";
import { mergeSearchResults, combineExpansionResults } from "./merge.js";
import type { SearchResult, WikiPage } from "@sibyl/sdk";

const mockPage: WikiPage = {
  id: "page1",
  slug: "test-page",
  title: "Test Page",
  type: "entity",
  contentPath: "/wiki/entity/test-page.md",
  tags: [],
  sourceIds: [],
  aliases: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  version: 1,
};

describe("merge.ts", () => {
  describe("mergeSearchResults", () => {
    it("should merge results from multiple variants", () => {
      const variant1Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.8, combinedScore: 0.8, matchType: "keyword" },
      ];

      const variant2Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.9, combinedScore: 0.9, matchType: "keyword" },
      ];

      const resultsByVariant = new Map([
        ["variant1", variant1Results],
        ["variant2", variant2Results],
      ]);

      const merged = mergeSearchResults(resultsByVariant);

      expect(merged).toHaveLength(1);
      expect(merged[0].matchedBy).toEqual(["variant1", "variant2"]);
      expect(merged[0].bestVariant).toBe("variant2");
      expect(merged[0].combinedScore).toBe(1);
    });

    it("should boost results matched by multiple variants", () => {
      const variant1Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.8, combinedScore: 0.8, matchType: "keyword" },
      ];

      const variant2Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.8, combinedScore: 0.8, matchType: "keyword" },
      ];

      const resultsByVariant = new Map([
        ["variant1", variant1Results],
        ["variant2", variant2Results],
      ]);

      const merged = mergeSearchResults(resultsByVariant);

      expect(merged[0].combinedScore).toBeGreaterThan(0.8);
    });

    it("should keep highest score for duplicate pages", () => {
      const variant1Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.5, combinedScore: 0.5, matchType: "keyword" },
      ];

      const variant2Results: SearchResult[] = [
        { page: mockPage, keywordScore: 0.9, combinedScore: 0.9, matchType: "keyword" },
      ];

      const resultsByVariant = new Map([
        ["variant1", variant1Results],
        ["variant2", variant2Results],
      ]);

      const merged = mergeSearchResults(resultsByVariant);

      expect(merged[0].combinedScore).toBe(1);
    });

    it("should limit results to keepTopN", () => {
      const page2: WikiPage = { ...mockPage, id: "page2", slug: "test-page-2" };
      const page3: WikiPage = { ...mockPage, id: "page3", slug: "test-page-3" };

      const variantResults: SearchResult[] = [
        { page: mockPage, keywordScore: 0.9, combinedScore: 0.9, matchType: "keyword" },
        { page: page2, keywordScore: 0.8, combinedScore: 0.8, matchType: "keyword" },
        { page: page3, keywordScore: 0.7, combinedScore: 0.7, matchType: "keyword" },
      ];

      const resultsByVariant = new Map([["variant1", variantResults]]);

      const merged = mergeSearchResults(resultsByVariant, { keepTopN: 2 });

      expect(merged).toHaveLength(2);
    });

    it("should handle empty results", () => {
      const resultsByVariant = new Map([
        ["variant1", []],
        ["variant2", []],
      ]);

      const merged = mergeSearchResults(resultsByVariant);

      expect(merged).toHaveLength(0);
    });
  });

  describe("combineExpansionResults", () => {
    it("should return single query when rewriting disabled", () => {
      const terminologyResult = { expandedQuery: "test query", hasExpansions: false };
      const rewriteResult = { variants: ["test query"], usedLlm: false };

      const combined = combineExpansionResults(terminologyResult, rewriteResult);

      expect(combined.queries).toHaveLength(1);
      expect(combined.queries[0]).toBe("test query");
      expect(combined.llmRewritten).toBe(false);
    });

    it("should return multiple queries when rewriting enabled", () => {
      const terminologyResult = { expandedQuery: "Global Sales performance", hasExpansions: true };
      const rewriteResult = {
        variants: ["Global Sales metrics", "GS quarterly results", "Global Sales revenue"],
        usedLlm: true,
      };

      const combined = combineExpansionResults(terminologyResult, rewriteResult);

      expect(combined.queries).toHaveLength(3);
      expect(combined.llmRewritten).toBe(true);
      expect(combined.terminologyExpanded).toBe(true);
    });
  });
});
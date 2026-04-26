import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  terminologyExpansion,
  buildGlossary,
  expandTerminology,
  normalizeTerm,
  tokenizeQuery,
  invalidateGlossaryCache,
} from "./terminology.js";
import { storage } from "../storage/index.js";

const mockFindAll = vi.fn();
vi.mock("../storage/index.js", () => ({
  storage: {
    wikiPages: {
      findAll: mockFindAll,
    },
  },
}));

describe("terminology expansion", () => {
  beforeEach(() => {
    invalidateGlossaryCache();
    mockFindAll.mockReset();
  });

  describe("normalizeTerm", () => {
    it("should normalize terms to lowercase", () => {
      expect(normalizeTerm("GS")).toBe("gs");
      expect(normalizeTerm("Global Sales")).toBe("global sales");
    });

    it("should trim whitespace", () => {
      expect(normalizeTerm("  GS  ")).toBe("gs");
    });

    it("should remove non-word characters", () => {
      expect(normalizeTerm("GS!")).toBe("gs");
      expect(normalizeTerm("GS-2024")).toBe("gs2024");
    });
  });

  describe("tokenizeQuery", () => {
    it("should split query into tokens", () => {
      expect(tokenizeQuery("How did GS perform")).toEqual(["how", "did", "gs", "perform"]);
    });

    it("should filter out short tokens", () => {
      expect(tokenizeQuery("a GS test")).toEqual(["gs", "test"]);
    });

    it("should handle punctuation", () => {
      expect(tokenizeQuery("GS, Global Sales!")).toEqual(["gs", "global", "sales"]);
    });
  });

  describe("buildGlossary", () => {
    it("should build glossary from entity pages with aliases", async () => {
      mockFindAll.mockResolvedValue([
        {
          id: "page1",
          slug: "global-sales",
          title: "Global Sales",
          type: "entity",
          contentPath: "/wiki/entity/global-sales.md",
          aliases: ["GS", "gsabbr"],
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      ]);

      const glossary = await buildGlossary();

      expect(glossary.entries.size).toBe(2);
      expect(glossary.entries.get("gs")?.formalTerm).toBe("Global Sales");
      expect(glossary.entries.get("gsabbr")?.formalTerm).toBe("Global Sales");
    });

    it("should skip pages without aliases", async () => {
      mockFindAll.mockResolvedValue([
        {
          id: "page1",
          slug: "some-entity",
          title: "Some Entity",
          type: "entity",
          contentPath: "/wiki/entity/some-entity.md",
          aliases: [],
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      ]);

      const glossary = await buildGlossary();

      expect(glossary.entries.size).toBe(0);
    });

    it("should cache glossary", async () => {
      mockFindAll.mockResolvedValue([]);

      await buildGlossary();
      await buildGlossary();

      expect(mockFindAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("expandTerminology", () => {
    it("should expand terms using glossary", async () => {
      mockFindAll.mockResolvedValue([
        {
          id: "page1",
          slug: "global-sales",
          title: "Global Sales",
          type: "entity",
          contentPath: "/wiki/entity/global-sales.md",
          aliases: ["GS"],
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      ]);

      const result = await expandTerminology("How did GS perform");

      expect(result.hasExpansions).toBe(true);
      expect(result.expansions).toContainEqual({
        original: "gs",
        formal: "Global Sales",
        pageSlug: "global-sales",
      });
    });

    it("should not expand when no matching aliases", async () => {
      mockFindAll.mockResolvedValue([
        {
          id: "page1",
          slug: "global-sales",
          title: "Global Sales",
          type: "entity",
          contentPath: "/wiki/entity/global-sales.md",
          aliases: ["GS"],
          tags: [],
          sourceIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1,
        },
      ]);

      const result = await expandTerminology("How did Marketing perform");

      expect(result.hasExpansions).toBe(false);
      expect(result.expansions).toHaveLength(0);
    });
  });
});
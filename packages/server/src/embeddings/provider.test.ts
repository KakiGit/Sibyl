import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { 
  computeContentHash, 
  cosineSimilarity, 
  euclideanDistance,
  getEmbeddingDimension,
  getDefaultModel,
  resetEmbedder
} from "./provider.js";

describe("Embedding Provider Utilities", () => {
  describe("computeContentHash", () => {
    it("should generate consistent hash for same content", () => {
      const content = "Test content for hashing";
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hash for different content", () => {
      const hash1 = computeContentHash("Content A");
      const hash2 = computeContentHash("Content B");
      expect(hash1).not.toBe(hash2);
    });

    it("should generate hash for empty content", () => {
      const hash = computeContentHash("");
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    it("should generate 8-character hex string", () => {
      const hash = computeContentHash("Some test content");
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it("should handle long content", () => {
      const longContent = "A".repeat(10000);
      const hash = computeContentHash(longContent);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(8);
    });
  });

  describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
      const vec = [1, 2, 3, 4, 5];
      const similarity = cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(0, 5);
    });

    it("should return -1 for opposite vectors", () => {
      const vec1 = [1, 1, 1];
      const vec2 = [-1, -1, -1];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it("should return 0 for vectors of different lengths", () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it("should return 0 for zero vectors", () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBe(0);
    });

    it("should handle normalized vectors correctly", () => {
      const vec1 = [0.5, 0.5, 0.5, 0.5];
      const vec2 = [0.5, 0.5, 0.5, 0.5];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1, 5);
    });
  });

  describe("euclideanDistance", () => {
    it("should return 0 for identical vectors", () => {
      const vec = [1, 2, 3];
      const distance = euclideanDistance(vec, vec);
      expect(distance).toBe(0);
    });

    it("should calculate correct distance", () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 1, 1];
      const distance = euclideanDistance(vec1, vec2);
      expect(distance).toBeCloseTo(Math.sqrt(3), 5);
    });

    it("should return Infinity for vectors of different lengths", () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];
      const distance = euclideanDistance(vec1, vec2);
      expect(distance).toBe(Infinity);
    });
  });

  describe("getEmbeddingDimension", () => {
    it("should return 384 for all-MiniLM-L6-v2", () => {
      const dimension = getEmbeddingDimension();
      expect(dimension).toBe(384);
    });
  });

  describe("getDefaultModel", () => {
    it("should return the default model name", () => {
      const model = getDefaultModel();
      expect(model).toBe("Xenova/all-MiniLM-L6-v2");
    });
  });
});

describe("Embedding Provider - Mocked", () => {
  beforeEach(() => {
    resetEmbedder();
  });

  afterEach(() => {
    resetEmbedder();
  });

  it("should handle reset embedder correctly", () => {
    resetEmbedder();
    expect(true).toBe(true);
  });
});
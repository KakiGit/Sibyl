import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { 
  getOrGenerateEmbedding,
  batchGetOrGenerateEmbeddings,
  searchBySimilarity,
  semanticSearch,
  cosineSimilarity,
  computeContentHash,
  resetEmbedder
} from "./index.js";

let testDbDir: string;
let testDbPath: string;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-embeddings-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);
  
  resetEmbedder();
});

afterEach(async () => {
  closeDatabase();
  resetEmbedder();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

describe("Embeddings Service", () => {
  describe("getOrGenerateEmbedding", () => {
    it("should cache embedding by content hash", async () => {
      const content = "Test content for embedding cache";
      const contentHash = computeContentHash(content);
      
      const result1 = await getOrGenerateEmbedding(content);
      const result2 = await getOrGenerateEmbedding(content);
      
      expect(result1?.contentHash).toBe(contentHash);
      
      if (result1 && result2) {
        expect(result1.id).toBe(result2.id);
        expect(result1.embedding).toEqual(result2.embedding);
      }
    });

    it("should generate different embeddings for different content", async () => {
      const result1 = await getOrGenerateEmbedding("Content about machine learning");
      const result2 = await getOrGenerateEmbedding("Content about cooking recipes");
      
      if (result1 && result2) {
        expect(result1.contentHash).not.toBe(result2.contentHash);
        expect(result1.id).not.toBe(result2.id);
        
        const similarity = cosineSimilarity(result1.embedding, result2.embedding);
        expect(similarity).toBeLessThan(0.9);
      }
    });

    it("should store embedding in database", async () => {
      const content = "Database storage test content";
      const result = await getOrGenerateEmbedding(content);
      
      if (result) {
        const cached = await storage.embeddingsCache.findByContentHash(result.contentHash);
        expect(cached).toBeDefined();
        expect(cached?.embedding).toEqual(result.embedding);
        expect(cached?.model).toBe(result.model);
      }
    });
  });

  describe("batchGetOrGenerateEmbeddings", () => {
    it("should process multiple contents", async () => {
      const contents = [
        "First piece of content",
        "Second piece of content",
        "Third piece of content",
      ];
      
      const results = await batchGetOrGenerateEmbeddings(contents);
      
      expect(results.length).toBe(3);
      
      for (const result of results) {
        if (result) {
          expect(result.embedding).toBeDefined();
          expect(result.embedding.length).toBe(384);
          expect(result.contentHash).toBeDefined();
        }
      }
    });

    it("should cache all embeddings", async () => {
      const contents = ["A", "B", "C"];
      
      await batchGetOrGenerateEmbeddings(contents);
      
      const cachedCount = await storage.embeddingsCache.count();
      expect(cachedCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("searchBySimilarity", () => {
    it("should return results sorted by similarity", async () => {
      const queryEmbedding = Array(384).fill(0.5);
      
      const embeddings = [
        { id: "1", embedding: Array(384).fill(0.6) },
        { id: "2", embedding: Array(384).fill(0.3) },
        { id: "3", embedding: Array(384).fill(0.55) },
      ];
      
      const results = await searchBySimilarity(queryEmbedding, embeddings, { threshold: 0.8 });
      
      expect(results.length).toBeGreaterThan(0);
      
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it("should filter by threshold", async () => {
      const queryEmbedding = Array(384).fill(1);
      
      const embeddings = [
        { id: "high", embedding: Array(384).fill(0.95) },
        { id: "medium", embedding: Array(384).fill(0.8) },
        { id: "low", embedding: Array(384).fill(0.5) },
      ];
      
      const results = await searchBySimilarity(queryEmbedding, embeddings, { threshold: 0.9 });
      
      expect(results.every((r) => r.similarity >= 0.9)).toBe(true);
    });

    it("should limit results", async () => {
      const queryEmbedding = Array(384).fill(0.5);
      
      const embeddings = Array(20).fill(null).map((_, i) => ({
        id: `${i}`,
        embedding: Array(384).fill(0.5),
      }));
      
      const results = await searchBySimilarity(queryEmbedding, embeddings, { limit: 5 });
      
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe("semanticSearch", () => {
    it("should find semantically similar content", async () => {
      const candidates = [
        { id: "ml", content: "Machine learning is a subset of artificial intelligence that enables systems to learn from data." },
        { id: "cooking", content: "Cooking involves preparing food using various techniques and ingredients." },
        { id: "ai", content: "Artificial intelligence is the simulation of human intelligence by machines." },
      ];
      
      const results = await semanticSearch("What is artificial intelligence?", candidates, {
        threshold: 0.3,
        limit: 2,
      });
      
      expect(results.length).toBeGreaterThan(0);
      
      const topResultId = results[0]?.id;
      expect(topResultId).toMatch(/^(ai|ml)$/);
    });
  });
});
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { load as loadVecExtension } from "sqlite-vec";
import { VectorStorage } from "./index.js";
import { getEmbeddingDimension } from "../embeddings/provider.js";

describe("VectorStorage", () => {
  let db: Database;
  let vectorStorage: VectorStorage;

  beforeAll(() => {
    db = new Database(":memory:");
    loadVecExtension(db);
    
    const dimension = getEmbeddingDimension();
    db.run(`
      CREATE VIRTUAL TABLE wiki_embeddings USING vec0(
        page_id TEXT PRIMARY KEY,
        embedding FLOAT[${dimension}]
      )
    `);
    
    vectorStorage = new VectorStorage();
    (vectorStorage as any).getSqlite = () => db;
  });

  afterAll(() => {
    db.close();
  });

  it("should insert an embedding", async () => {
    const dimension = getEmbeddingDimension();
    const embedding = new Array(dimension).fill(0.5);
    
    await vectorStorage.insert("test-page-1", embedding);
    
    const count = await vectorStorage.count();
    expect(count).toBe(1);
  });

  it("should retrieve an embedding", async () => {
    const dimension = getEmbeddingDimension();
    const embedding = new Array(dimension).fill(0.7);
    
    await vectorStorage.insert("test-page-2", embedding);
    
    const retrieved = await vectorStorage.get("test-page-2");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.length).toBe(dimension);
  });

  it("should delete an embedding", async () => {
    const dimension = getEmbeddingDimension();
    const embedding = new Array(dimension).fill(0.3);
    
    await vectorStorage.insert("test-page-3", embedding);
    
    await vectorStorage.delete("test-page-3");
    
    const retrieved = await vectorStorage.get("test-page-3");
    expect(retrieved).toBeNull();
  });

  it("should search for similar embeddings", async () => {
    const dimension = getEmbeddingDimension();
    
    const embedding1 = new Array(dimension).fill(0.1);
    const embedding2 = new Array(dimension).fill(0.9);
    const queryEmbedding = new Array(dimension).fill(0.2);
    
    await vectorStorage.insert("page-1", embedding1);
    await vectorStorage.insert("page-2", embedding2);
    
    const results = await vectorStorage.search(queryEmbedding, 2);
    
    expect(results.length).toBe(2);
    expect(results[0].pageId).toBe("page-1");
    expect(results[0].distance).toBeLessThan(results[1].distance);
  });

  it("should clear all embeddings", async () => {
    const dimension = getEmbeddingDimension();
    
    await vectorStorage.insert("clear-test-1", new Array(dimension).fill(0.5));
    await vectorStorage.insert("clear-test-2", new Array(dimension).fill(0.5));
    
    await vectorStorage.clear();
    
    const count = await vectorStorage.count();
    expect(count).toBe(0);
  });

  it("should reject embedding with wrong dimension", async () => {
    const wrongEmbedding = new Array(100).fill(0.5);
    
    expect(async () => {
      await vectorStorage.insert("wrong-dimension", wrongEmbedding);
    }).toThrow();
  });
});
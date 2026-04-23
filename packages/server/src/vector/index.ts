import { getDatabase } from "../database.js";
import { Database } from "bun:sqlite";
import { logger } from "@sibyl/shared";
import { getEmbeddingDimension } from "../embeddings/provider.js";

export interface VectorEntry {
  pageId: string;
  embedding: number[];
}

export interface VectorSearchResult {
  pageId: string;
  distance: number;
}

export class VectorStorage {
  private getSqlite(): Database {
    const db = getDatabase();
    return (db as unknown as { $client: Database }).$client;
  }

  async insert(pageId: string, embedding: number[]): Promise<void> {
    const sqlite = this.getSqlite();
    const embeddingDimension = getEmbeddingDimension();
    
    if (embedding.length !== embeddingDimension) {
      throw new Error(`Embedding dimension mismatch: expected ${embeddingDimension}, got ${embedding.length}`);
    }
    
    const float32Embedding = new Float32Array(embedding);
    const embeddingBlob = Buffer.from(float32Embedding.buffer);
    
    sqlite.run(
      `INSERT OR REPLACE INTO wiki_embeddings (page_id, embedding) VALUES (?, ?)`,
      [pageId, embeddingBlob]
    );
    
    logger.debug("Inserted vector into wiki_embeddings", { pageId });
  }

  async delete(pageId: string): Promise<void> {
    const sqlite = this.getSqlite();
    
    sqlite.run(`DELETE FROM wiki_embeddings WHERE page_id = ?`, [pageId]);
    
    logger.debug("Deleted vector from wiki_embeddings", { pageId });
  }

  async search(queryEmbedding: number[], limit: number = 10): Promise<VectorSearchResult[]> {
    const sqlite = this.getSqlite();
    const embeddingDimension = getEmbeddingDimension();
    
    if (queryEmbedding.length !== embeddingDimension) {
      throw new Error(`Query embedding dimension mismatch: expected ${embeddingDimension}, got ${queryEmbedding.length}`);
    }
    
    const float32Embedding = new Float32Array(queryEmbedding);
    const embeddingBlob = Buffer.from(float32Embedding.buffer);
    
    const results = sqlite.query<{ page_id: string; distance: number }, [Buffer, number]>(
      `SELECT page_id, distance FROM wiki_embeddings WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
    ).all(embeddingBlob, limit);
    
    logger.debug("Vector search completed", { 
      queryDimension: queryEmbedding.length, 
      resultsCount: results.length 
    });
    
    return results.map(r => ({
      pageId: r.page_id,
      distance: r.distance,
    }));
  }

  async get(pageId: string): Promise<number[] | null> {
    const sqlite = this.getSqlite();
    
    const results = sqlite.query<{ embedding: Buffer }, [string]>(
      `SELECT embedding FROM wiki_embeddings WHERE page_id = ?`
    ).get(pageId);
    
    if (!results) {
      return null;
    }
    
    const float32Array = new Float32Array(results.embedding.buffer);
    return Array.from(float32Array);
  }

  async count(): Promise<number> {
    const sqlite = this.getSqlite();
    
    const result = sqlite.query<{ count: number }, []>(
      `SELECT COUNT(*) as count FROM wiki_embeddings`
    ).get();
    
    return result?.count ?? 0;
  }

  async clear(): Promise<void> {
    const sqlite = this.getSqlite();
    
    sqlite.run(`DELETE FROM wiki_embeddings`);
    
    logger.debug("Cleared wiki_embeddings table");
  }
}

export const vectorStorage = new VectorStorage();
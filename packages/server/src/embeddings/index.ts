import { storage } from "../storage/index.js";
import { 
  generateEmbedding, 
  generateEmbeddingsBatch, 
  cosineSimilarity,
  computeContentHash,
  initializeEmbedder,
  getEmbeddingDimension,
  getDefaultModel,
  resetEmbedder,
} from "./provider.js";
import type { EmbeddingOptions, EmbeddingResult } from "./provider.js";
import { logger } from "@sibyl/shared";

export interface CachedEmbedding {
  id: string;
  contentHash: string;
  embedding: number[];
  model: string;
  createdAt: number;
}

export interface SimilarityResult {
  id: string;
  embedding: number[];
  similarity: number;
  metadata?: Record<string, unknown>;
}

export async function getOrGenerateEmbedding(
  content: string,
  options?: EmbeddingOptions
): Promise<CachedEmbedding | null> {
  const contentHash = computeContentHash(content);
  
  const cached = await storage.embeddingsCache.findByContentHash(contentHash);
  
  if (cached) {
    logger.debug("Using cached embedding", { contentHash, model: cached.model });
    return {
      id: cached.id,
      contentHash: cached.contentHash,
      embedding: cached.embedding,
      model: cached.model,
      createdAt: cached.createdAt,
    };
  }
  
  const result = await generateEmbedding(content, options);
  
  if (!result) {
    return null;
  }
  
  const stored = await storage.embeddingsCache.create(
    contentHash,
    result.embedding,
    result.model
  );
  
  return {
    id: stored.id,
    contentHash: stored.contentHash,
    embedding: stored.embedding,
    model: stored.model,
    createdAt: stored.createdAt,
  };
}

export async function batchGetOrGenerateEmbeddings(
  contents: string[],
  options?: EmbeddingOptions
): Promise<(CachedEmbedding | null)[]> {
  const concurrencyLimit = 4;
  const results: (CachedEmbedding | null)[] = new Array(contents.length).fill(null);
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < contents.length) {
      const index = currentIndex++;
      const content = contents[index];
      results[index] = await getOrGenerateEmbedding(content, options);
    }
  }
  
  const workers = Array(Math.min(concurrencyLimit, contents.length))
    .fill(null)
    .map(() => processNext());
  
  await Promise.all(workers);
  
  return results;
}

export async function searchBySimilarity(
  queryEmbedding: number[],
  embeddings: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }>,
  options?: {
    threshold?: number;
    limit?: number;
  }
): Promise<SimilarityResult[]> {
  const threshold = options?.threshold || 0.5;
  const limit = options?.limit || 10;
  
  const results: SimilarityResult[] = [];
  
  for (const item of embeddings) {
    const similarity = cosineSimilarity(queryEmbedding, item.embedding);
    
    if (similarity >= threshold) {
      results.push({
        id: item.id,
        embedding: item.embedding,
        similarity,
        metadata: item.metadata,
      });
    }
  }
  
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results.slice(0, limit);
}

export async function semanticSearch(
  query: string,
  candidates: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>,
  options?: {
    threshold?: number;
    limit?: number;
    model?: string;
  }
): Promise<Array<{ id: string; similarity: number; metadata?: Record<string, unknown> }>> {
  const queryEmbedding = await generateEmbedding(query, { model: options?.model });
  
  if (!queryEmbedding) {
    logger.warn("Failed to generate query embedding for semantic search");
    return [];
  }
  
  const candidateEmbeddings: Array<{ id: string; embedding: number[]; metadata?: Record<string, unknown> }> = [];
  
  for (const candidate of candidates) {
    const cached = await getOrGenerateEmbedding(candidate.content, { model: options?.model });
    
    if (cached) {
      candidateEmbeddings.push({
        id: candidate.id,
        embedding: cached.embedding,
        metadata: candidate.metadata,
      });
    }
  }
  
  const results = await searchBySimilarity(queryEmbedding.embedding, candidateEmbeddings, {
    threshold: options?.threshold,
    limit: options?.limit,
  });
  
  return results.map((r) => ({
    id: r.id,
    similarity: r.similarity,
    metadata: r.metadata,
  }));
}

export { 
  generateEmbedding, 
  generateEmbeddingsBatch, 
  cosineSimilarity,
  computeContentHash,
  initializeEmbedder,
  getEmbeddingDimension,
  getDefaultModel,
  resetEmbedder,
};

export type { EmbeddingOptions, EmbeddingResult };

export const embeddingsService = {
  getOrGenerateEmbedding,
  batchGetOrGenerateEmbeddings,
  searchBySimilarity,
  semanticSearch,
};
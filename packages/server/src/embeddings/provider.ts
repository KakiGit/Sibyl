import { pipeline, env } from "@xenova/transformers";
import { logger } from "@sibyl/shared";

env.allowLocalModels = false;
env.useBrowserCache = false;

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMENSION = 384;

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimension: number;
  contentHash: string;
}

let embedder: any = null;
let loadingPromise: Promise<void> | null = null;

export async function initializeEmbedder(model?: string): Promise<void> {
  const modelName = model || DEFAULT_MODEL;
  
  if (embedder) {
    return;
  }
  
  if (loadingPromise) {
    await loadingPromise;
    return;
  }
  
  loadingPromise = (async () => {
    try {
      logger.info("Loading embedding model", { model: modelName });
      embedder = await pipeline("feature-extraction", modelName, {
        quantized: true,
      });
      logger.info("Embedding model loaded successfully", { model: modelName });
    } catch (error) {
      logger.error("Failed to load embedding model", { 
        model: modelName, 
        error: (error as Error).message 
      });
      loadingPromise = null;
      throw error;
    }
  })();
  
  await loadingPromise;
}

export async function getEmbedder(): Promise<any> {
  if (!embedder) {
    try {
      await initializeEmbedder();
    } catch {
      return null;
    }
  }
  return embedder;
}

export function computeContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

export async function generateEmbedding(
  content: string,
  options?: EmbeddingOptions
): Promise<EmbeddingResult | null> {
  const embedderInstance = await getEmbedder();
  
  if (!embedderInstance) {
    logger.warn("Embedder not available, skipping embedding generation");
    return null;
  }
  
  try {
    const truncatedContent = content.length > 1000 
      ? content.slice(0, 1000) 
      : content;
    
    const output = await embedderInstance(truncatedContent, {
      pooling: "mean",
      normalize: true,
    });
    
    const data = output.data;
    const embedding = Array.isArray(data) 
      ? data 
      : Array.from(data as Iterable<number>);
    const contentHash = computeContentHash(content);
    
    logger.debug("Generated embedding", {
      dimension: embedding.length,
      contentHash,
      contentLength: content.length,
    });
    
    return {
      embedding,
      model: options?.model || DEFAULT_MODEL,
      dimension: embedding.length,
      contentHash,
    };
  } catch (error) {
    logger.error("Failed to generate embedding", { 
      error: (error as Error).message,
      contentLength: content.length,
    });
    return null;
  }
}

export async function generateEmbeddingsBatch(
  contents: string[],
  options?: EmbeddingOptions
): Promise<(EmbeddingResult | null)[]> {
  const concurrencyLimit = options?.batchSize ?? 4;
  
  const results: (EmbeddingResult | null)[] = new Array(contents.length).fill(null);
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < contents.length) {
      const index = currentIndex++;
      const content = contents[index];
      results[index] = await generateEmbedding(content, options);
    }
  }
  
  const workers = Array(Math.min(concurrencyLimit, contents.length))
    .fill(null)
    .map(() => processNext());
  
  await Promise.all(workers);
  
  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    return Infinity;
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  
  return Math.sqrt(sum);
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}

export function resetEmbedder(): void {
  embedder = null;
  loadingPromise = null;
}
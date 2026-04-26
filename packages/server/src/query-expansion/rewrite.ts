import { getLlmProvider } from "../llm/index.js";
import { logger } from "@sibyl/shared";
import { Cache } from "../cache/index.js";

const QUERY_REWRITE_SYSTEM_PROMPT = `You are a query expansion assistant. Given a user's natural language query, generate 3-5 keyword-focused search variants that would help find relevant information in a knowledge base.

Rules:
1. Each variant should be a concise keyword phrase (not full sentences)
2. Focus on key terms, concepts, and entities
3. Include different phrasings and synonyms
4. Keep variants short (2-5 words typically)
5. Output ONLY the variants, one per line, no numbering or explanations

Examples:
Query: "How did Global Sales perform last year?"
Variants:
Global Sales performance metrics
GS quarterly results
Global Sales revenue 2024
GS business performance
Global Sales annual report

Query: "What is the architecture of the system?"
Variants:
system architecture design
technical architecture overview
system components structure
architecture diagram
system design patterns`;

const rewriteCache = new Cache<string[]>({ ttl: 3600000, maxEntries: 50 });

function generateCacheKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, "_");
}

function parseVariants(response: string): string[] {
  const lines = response
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.match(/^\d+\./));
  
  return lines.slice(0, 5);
}

export interface QueryRewriteResult {
  originalQuery: string;
  variants: string[];
  usedLlm: boolean;
  model?: string;
}

export async function rewriteQuery(query: string): Promise<QueryRewriteResult> {
  const cacheKey = generateCacheKey(query);
  const cached = rewriteCache.get(cacheKey);
  
  if (cached) {
    logger.debug("Using cached query rewrite", { query, variants: cached.length });
    return {
      originalQuery: query,
      variants: cached,
      usedLlm: false,
    };
  }
  
  const llmProvider = getLlmProvider();
  
  if (!llmProvider) {
    logger.debug("No LLM provider, returning original query as single variant");
    return {
      originalQuery: query,
      variants: [query],
      usedLlm: false,
    };
  }
  
  try {
    const userPrompt = `Query: ${query}\nVariants:`;
    
    const response = await llmProvider.call(QUERY_REWRITE_SYSTEM_PROMPT, userPrompt);
    const variants = parseVariants(response.content);
    
    if (variants.length === 0) {
      logger.warn("LLM returned no valid variants, using original query");
      return {
        originalQuery: query,
        variants: [query],
        usedLlm: true,
        model: response.model,
      };
    }
    
    rewriteCache.set(cacheKey, variants);
    
    logger.debug("Rewrote query into variants", {
      query,
      variants: variants.length,
      model: response.model,
    });
    
    return {
      originalQuery: query,
      variants,
      usedLlm: true,
      model: response.model,
    };
  } catch (error) {
    logger.warn("Query rewrite failed, using original query", {
      error: (error as Error).message,
    });
    return {
      originalQuery: query,
      variants: [query],
      usedLlm: false,
    };
  }
}

export function invalidateRewriteCache(): void {
  rewriteCache.clear();
}

export const queryRewrite = {
  rewriteQuery,
  invalidateRewriteCache,
};
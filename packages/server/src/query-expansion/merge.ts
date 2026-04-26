import type { SearchResult } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";

export interface MergedSearchResult extends SearchResult {
  matchedBy: string[];
  bestVariant: string;
}

export interface MergeOptions {
  keepTopN?: number;
  boostMultiMatch?: boolean;
  multiMatchBoostWeight?: number;
}

export function mergeSearchResults(
  resultsByVariant: Map<string, SearchResult[]>,
  options: MergeOptions = {}
): MergedSearchResult[] {
  const keepTopN = options.keepTopN ?? 10;
  const boostMultiMatch = options.boostMultiMatch ?? true;
  const multiMatchBoostWeight = options.multiMatchBoostWeight ?? 0.2;
  
  const pageResults = new Map<string, MergedSearchResult>();
  
  for (const [variant, results] of resultsByVariant) {
    for (const result of results) {
      const pageId = result.page.id;
      const existing = pageResults.get(pageId);
      
      if (!existing) {
        pageResults.set(pageId, {
          ...result,
          matchedBy: [variant],
          bestVariant: variant,
        });
      } else {
        existing.matchedBy.push(variant);
        
        if (result.combinedScore > existing.combinedScore) {
          existing.bestVariant = variant;
          existing.keywordScore = result.keywordScore;
          existing.semanticScore = result.semanticScore;
          existing.combinedScore = result.combinedScore;
          existing.matchType = result.matchType;
        }
      }
    }
  }
  
  const merged = Array.from(pageResults.values());
  
  if (boostMultiMatch) {
    for (const result of merged) {
      if (result.matchedBy.length > 1) {
        const boost = result.matchedBy.length * multiMatchBoostWeight;
        result.combinedScore = Math.min(1, result.combinedScore + boost);
      }
    }
  }
  
  merged.sort((a, b) => b.combinedScore - a.combinedScore);
  
  const finalResults = merged.slice(0, keepTopN);
  
  logger.debug("Merged search results", {
    variantsCount: resultsByVariant.size,
    totalPages: pageResults.size,
    multiMatchCount: merged.filter((r) => r.matchedBy.length > 1).length,
    finalCount: finalResults.length,
  });
  
  return finalResults;
}

export interface QueryExpansionResult {
  queries: string[];
  terminologyExpanded: boolean;
  llmRewritten: boolean;
}

export function combineExpansionResults(
  terminologyResult: { expandedQuery: string; hasExpansions: boolean },
  rewriteResult: { variants: string[]; usedLlm: boolean }
): QueryExpansionResult {
  const baseQuery = terminologyResult.expandedQuery;
  
  if (rewriteResult.usedLlm && rewriteResult.variants.length > 1) {
    const expandedVariants = rewriteResult.variants.map((variant) => {
      if (terminologyResult.hasExpansions) {
        return applyTerminologyToVariant(variant, terminologyResult);
      }
      return variant;
    });
    
    return {
      queries: expandedVariants,
      terminologyExpanded: terminologyResult.hasExpansions,
      llmRewritten: true,
    };
  }
  
  return {
    queries: [baseQuery],
    terminologyExpanded: terminologyResult.hasExpansions,
    llmRewritten: false,
  };
}

function applyTerminologyToVariant(
  variant: string,
  _terminologyResult: { expandedQuery: string }
): string {
  return variant;
}

export const resultMerge = {
  mergeSearchResults,
  combineExpansionResults,
};
import { expandTerminology, type TerminologyExpansionResult } from "./terminology.js";
import { rewriteQuery } from "./rewrite.js";
import { combineExpansionResults } from "./merge.js";
import { logger } from "@sibyl/shared";

export interface QueryExpansionOptions {
  useTerminologyExpansion?: boolean;
  useQueryRewriting?: boolean;
}

export interface ExpandedQueries {
  queries: string[];
  originalQuery: string;
  terminologyExpanded: boolean;
  llmRewritten: boolean;
  expansions: Array<{ original: string; formal: string; pageSlug: string }>;
}

export async function expandQuery(
  query: string,
  options: QueryExpansionOptions = {}
): Promise<ExpandedQueries> {
  const useTerminology = options.useTerminologyExpansion ?? true;
  const useRewriting = options.useQueryRewriting ?? false;
  
  let terminologyResult: TerminologyExpansionResult = {
    originalQuery: query,
    expandedQuery: query,
    expansions: [],
    hasExpansions: false,
  };
  
  if (useTerminology) {
    try {
      terminologyResult = await expandTerminology(query);
    } catch (error) {
      logger.warn("Terminology expansion failed", { error: (error as Error).message });
    }
  }
  
  let rewriteResult = {
    originalQuery: terminologyResult.expandedQuery,
    variants: [terminologyResult.expandedQuery],
    usedLlm: false,
  };
  
  if (useRewriting) {
    try {
      rewriteResult = await rewriteQuery(terminologyResult.expandedQuery);
    } catch (error) {
      logger.warn("Query rewriting failed", { error: (error as Error).message });
    }
  }
  
  const combined = combineExpansionResults(terminologyResult, rewriteResult);
  
  logger.info("Query expansion complete", {
    originalQuery: query,
    expandedQueries: combined.queries.length,
    terminologyExpanded: combined.terminologyExpanded,
    llmRewritten: combined.llmRewritten,
  });
  
  return {
    queries: combined.queries,
    originalQuery: query,
    terminologyExpanded: combined.terminologyExpanded,
    llmRewritten: combined.llmRewritten,
    expansions: terminologyResult.expansions,
  };
}

export { terminologyExpansion } from "./terminology.js";
export { queryRewrite } from "./rewrite.js";
export { resultMerge } from "./merge.js";
export type { TerminologyExpansionResult, TerminologyEntry } from "./terminology.js";
export type { QueryRewriteResult } from "./rewrite.js";
export type { MergedSearchResult, MergeOptions } from "./merge.js";
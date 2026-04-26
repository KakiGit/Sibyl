import { storage } from "../storage/index.js";
import { logger } from "@sibyl/shared";

export interface TerminologyEntry {
  formalTerm: string;
  aliases: string[];
  pageSlug: string;
}

export interface TerminologyGlossary {
  entries: Map<string, TerminologyEntry>;
  lastUpdated: number;
}

let glossaryCache: TerminologyGlossary | null = null;
const GLOSSARY_TTL_MS = 60000;

export async function buildGlossary(): Promise<TerminologyGlossary> {
  const now = Date.now();
  
  if (glossaryCache && (now - glossaryCache.lastUpdated) < GLOSSARY_TTL_MS) {
    return glossaryCache;
  }
  
  const entityPages = await storage.wikiPages.findAll({ type: "entity", limit: 200 });
  
  const entries = new Map<string, TerminologyEntry>();
  
  for (const page of entityPages) {
    if (page.aliases && page.aliases.length > 0) {
      for (const alias of page.aliases) {
        const normalizedAlias = normalizeTerm(alias);
        entries.set(normalizedAlias, {
          formalTerm: page.title,
          aliases: page.aliases,
          pageSlug: page.slug,
        });
      }
    }
  }
  
  glossaryCache = {
    entries,
    lastUpdated: now,
  };
  
  logger.debug("Built terminology glossary", { entryCount: entries.size });
  return glossaryCache;
}

export function invalidateGlossaryCache(): void {
  glossaryCache = null;
}

export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "");
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

export async function expandTerminology(query: string): Promise<TerminologyExpansionResult> {
  const glossary = await buildGlossary();
  const tokens = tokenizeQuery(query);
  
  const expansions: Array<{ original: string; formal: string; pageSlug: string }> = [];
  const expandedTokens: string[] = [];
  
  for (const token of tokens) {
    const normalized = normalizeTerm(token);
    const entry = glossary.entries.get(normalized);
    
    if (entry) {
      expandedTokens.push(entry.formalTerm);
      expansions.push({
        original: token,
        formal: entry.formalTerm,
        pageSlug: entry.pageSlug,
      });
    } else {
      expandedTokens.push(token);
    }
  }
  
  const expandedQuery = expandedTokens.join(" ");
  
  logger.debug("Expanded terminology", {
    originalQuery: query,
    expandedQuery,
    expansions: expansions.length,
  });
  
  return {
    originalQuery: query,
    expandedQuery,
    expansions,
    hasExpansions: expansions.length > 0,
  };
}

export interface TerminologyExpansionResult {
  originalQuery: string;
  expandedQuery: string;
  expansions: Array<{ original: string; formal: string; pageSlug: string }>;
  hasExpansions: boolean;
}

export const terminologyExpansion = {
  buildGlossary,
  expandTerminology,
  invalidateGlossaryCache,
  normalizeTerm,
  tokenizeQuery,
};
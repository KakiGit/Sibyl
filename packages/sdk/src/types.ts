import type { RawResource, WikiPage, WikiLink, ProcessingLog, EmbeddingCache, WikiPageVersion } from "./schemas.js";

export interface CreateRawResourceInput {
  type: RawResource["type"];
  filename: string;
  sourceUrl?: string;
  contentPath: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWikiPageInput {
  slug: string;
  title: string;
  type: WikiPage["type"];
  contentPath: string;
  summary?: string;
  tags?: string[];
  sourceIds?: string[];
  aliases?: string[];
}

export interface CreateWikiLinkInput {
  fromPageId: string;
  toPageId: string;
  relationType: string;
}

export interface CreateProcessingLogInput {
  operation: ProcessingLog["operation"];
  rawResourceId?: string;
  wikiPageId?: string;
  details?: Record<string, unknown>;
}

export interface CreateWikiPageVersionInput {
  wikiPageId: string;
  version: number;
  title: string;
  summary?: string;
  tags?: string[];
  contentSnapshot: string;
  changedBy?: string;
  changeReason?: string;
}

export interface QueryWikiPagesOptions {
  type?: WikiPage["type"];
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface QueryRawResourcesOptions {
  type?: RawResource["type"];
  processed?: boolean;
  limit?: number;
  offset?: number;
}

export interface HybridSearchOptions {
  query: string;
  type?: WikiPage["type"];
  tags?: string[];
  useSemantic?: boolean;
  semanticThreshold?: number;
  limit?: number;
}

export interface SearchResult {
  page: WikiPage;
  keywordScore: number;
  semanticScore?: number;
  combinedScore: number;
  matchType: "keyword" | "semantic" | "hybrid";
}

export type { RawResource, WikiPage, WikiLink, ProcessingLog, EmbeddingCache, WikiPageVersion };
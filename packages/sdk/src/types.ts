import type { RawResource, WikiPage, WikiLink, ProcessingLog, EmbeddingCache } from "./schemas.js";

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

export type { RawResource, WikiPage, WikiLink, ProcessingLog, EmbeddingCache };
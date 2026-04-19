import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPage, WikiPageType } from "@sibyl/sdk";

export interface QueryOptions {
  query: string;
  types?: WikiPageType[];
  tags?: string[];
  limit?: number;
  includeContent?: boolean;
  wikiFileManager?: WikiFileManager;
}

export interface QueryMatch {
  page: WikiPage;
  content?: string;
  relevanceScore: number;
  matchType: "title" | "summary" | "tags" | "content";
}

export interface QueryResult {
  query: string;
  matches: QueryMatch[];
  total: number;
  executedAt: number;
}

function calculateRelevanceScore(
  page: WikiPage,
  queryTerms: string[],
  content?: string
): { score: number; matchType: QueryMatch["matchType"] } {
  const queryLower = queryTerms.map((t) => t.toLowerCase());
  const titleLower = page.title.toLowerCase();
  const summaryLower = (page.summary || "").toLowerCase();
  const tagsLower = page.tags.map((t) => t.toLowerCase());
  const contentLower = (content || "").toLowerCase();

  let titleMatches = 0;
  let summaryMatches = 0;
  let tagMatches = 0;
  let contentMatches = 0;

  for (const term of queryLower) {
    if (titleLower.includes(term)) titleMatches++;
    if (summaryLower.includes(term)) summaryMatches++;
    if (tagsLower.some((t) => t.includes(term))) tagMatches++;
    if (contentLower.includes(term)) contentMatches++;
  }

  if (titleMatches > 0) {
    return {
      score: 100 + titleMatches * 10 + summaryMatches * 5 + tagMatches * 3,
      matchType: "title",
    };
  }

  if (summaryMatches > 0) {
    return {
      score: 50 + summaryMatches * 10 + tagMatches * 3,
      matchType: "summary",
    };
  }

  if (tagMatches > 0) {
    return {
      score: 30 + tagMatches * 10,
      matchType: "tags",
    };
  }

  if (contentMatches > 0) {
    return {
      score: 10 + contentMatches * 2,
      matchType: "content",
    };
  }

  return { score: 0, matchType: "content" };
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

export async function queryWiki(options: QueryOptions): Promise<QueryResult> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  const limit = options.limit || 20;
  const includeContent = options.includeContent ?? false;

  if (!options.query || options.query.trim().length === 0) {
    throw new Error("Query string is required");
  }

  const queryTerms = tokenizeQuery(options.query);

  if (queryTerms.length === 0) {
    throw new Error("Query must contain meaningful terms");
  }

  const allPages = await storage.wikiPages.findAll({ limit: 200 });

  let filteredPages = allPages;

  if (options.types && options.types.length > 0) {
    filteredPages = filteredPages.filter((p) => options.types!.includes(p.type));
  }

  if (options.tags && options.tags.length > 0) {
    filteredPages = filteredPages.filter((p) =>
      options.tags!.some((tag) => p.tags.includes(tag))
    );
  }

  const matches: QueryMatch[] = [];

  for (const page of filteredPages) {
    let content: string | undefined;

    if (includeContent) {
      const pageContent = wikiManager.readPage(page.type, page.slug);
      content = pageContent?.content;
    }

    const { score, matchType } = calculateRelevanceScore(page, queryTerms, content);

    if (score > 0) {
      matches.push({
        page,
        content: includeContent ? content : undefined,
        relevanceScore: score,
        matchType,
      });
    }
  }

  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const limitedMatches = matches.slice(0, limit);

  const now = Date.now();

  await storage.processingLog.create({
    operation: "query",
    details: {
      query: options.query,
      types: options.types,
      tags: options.tags,
      resultCount: limitedMatches.length,
      totalMatches: matches.length,
    },
  });

  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "query",
    title: options.query,
    details: `Found ${limitedMatches.length} matches (total: ${matches.length})`,
  });

  logger.info("Executed wiki query", {
    query: options.query,
    matches: limitedMatches.length,
    total: matches.length,
  });

  return {
    query: options.query,
    matches: limitedMatches,
    total: matches.length,
    executedAt: now,
  };
}

export async function searchWikiPages(searchTerm: string): Promise<WikiPage[]> {
  const pages = await storage.wikiPages.findAll({ search: searchTerm });
  return pages;
}

export async function getWikiPageBySlug(
  slug: string,
  wikiManager?: WikiFileManager
): Promise<{
  page: WikiPage;
  content: string;
} | null> {
  const manager = wikiManager || wikiFileManager;
  const page = await storage.wikiPages.findBySlug(slug);

  if (!page) {
    return null;
  }

  const pageContent = manager.readPage(page.type, page.slug);

  return {
    page,
    content: pageContent?.content || "",
  };
}

export async function getWikiPagesByType(type: WikiPageType): Promise<WikiPage[]> {
  return storage.wikiPages.findAll({ type });
}

export async function getWikiPagesByTags(tags: string[]): Promise<WikiPage[]> {
  const allPages = await storage.wikiPages.findAll({ limit: 200 });
  return allPages.filter((page) => tags.some((tag) => page.tags.includes(tag)));
}

export async function getRecentWikiPages(limit: number = 10): Promise<WikiPage[]> {
  return storage.wikiPages.findAll({ limit });
}

export async function getWikiPageGraph(pageId: string): Promise<{
  page: WikiPage;
  outgoingLinks: { toPageId: string; relationType: string }[];
  incomingLinks: { fromPageId: string; relationType: string }[];
}> {
  const page = await storage.wikiPages.findById(pageId);

  if (!page) {
    throw new Error(`Wiki page not found: ${pageId}`);
  }

  const outgoingLinks = await storage.wikiLinks.findByFromPageId(pageId);
  const incomingLinks = await storage.wikiLinks.findByToPageId(pageId);

  return {
    page,
    outgoingLinks: outgoingLinks.map((l) => ({
      toPageId: l.toPageId,
      relationType: l.relationType,
    })),
    incomingLinks: incomingLinks.map((l) => ({
      fromPageId: l.fromPageId,
      relationType: l.relationType,
    })),
  };
}

export const queryProcessor = {
  queryWiki,
  searchWikiPages,
  getWikiPageBySlug,
  getWikiPagesByType,
  getWikiPagesByTags,
  getRecentWikiPages,
  getWikiPageGraph,
};
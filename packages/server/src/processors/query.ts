import { storage, SynthesisCacheStorage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { getLlmProvider, type LlmProvider } from "../llm/index.js";
import { semanticSearch, initializeEmbedder } from "../embeddings/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPage, WikiPageType } from "@sibyl/sdk";

export interface QueryOptions {
  query: string;
  types?: WikiPageType[];
  tags?: string[];
  limit?: number;
  includeContent?: boolean;
  wikiFileManager?: WikiFileManager;
  useSemanticSearch?: boolean;
  semanticThreshold?: number;
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

export interface SynthesizeOptions {
  query: string;
  types?: WikiPageType[];
  tags?: string[];
  maxPages?: number;
  wikiFileManager?: WikiFileManager;
  llmProvider?: LlmProvider | null;
  skipLlm?: boolean;
}

export interface Citation {
  pageSlug: string;
  pageTitle: string;
  pageType: WikiPageType;
  relevanceScore: number;
}

export interface SynthesizeResult {
  query: string;
  answer: string;
  citations: Citation[];
  synthesizedAt: number;
  model?: string;
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
  const useSemantic = options.useSemanticSearch ?? false;
  const semanticThreshold = options.semanticThreshold ?? 0.3;

  if (!options.query || options.query.trim().length === 0) {
    throw new Error("Query string is required");
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

  if (useSemantic) {
    try {
      await initializeEmbedder();
      
      const candidates = filteredPages.map((page) => {
        const pageContent = wikiManager.readPage(page.type, page.slug);
        const content = pageContent?.content || page.summary || "";
        return {
          id: page.id,
          content: `${page.title}\n${page.summary || ""}\n${content}`,
          metadata: { page, content: includeContent ? content : undefined },
        };
      });

      const semanticResults = await semanticSearch(options.query, candidates, {
        threshold: semanticThreshold,
        limit,
      });

      for (const result of semanticResults) {
        const page = result.metadata?.page as WikiPage;
        if (page) {
          matches.push({
            page,
            content: result.metadata?.content as string | undefined,
            relevanceScore: Math.round(result.similarity * 100),
            matchType: "content",
          });
        }
      }
    } catch (error) {
      logger.warn("Semantic search failed, falling back to keyword search", {
        error: (error as Error).message,
      });
    }
  }

  if (!useSemantic || matches.length === 0) {
    const queryTerms = tokenizeQuery(options.query);

    if (queryTerms.length === 0) {
      throw new Error("Query must contain meaningful terms");
    }

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
      useSemanticSearch: useSemantic,
      resultCount: limitedMatches.length,
      totalMatches: matches.length,
    },
  });

  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "query",
    title: options.query,
    details: `Found ${limitedMatches.length} matches (total: ${matches.length})${useSemantic ? " [semantic]" : ""}`,
  });

  logger.info("Executed wiki query", {
    query: options.query,
    matches: limitedMatches.length,
    total: matches.length,
    semantic: useSemantic,
  });

  return {
    query: options.query,
    matches: limitedMatches,
    total: matches.length,
    executedAt: now,
  };
}

const SYNTHESIS_SYSTEM_PROMPT = `You are a knowledge synthesis assistant. Your task is to answer questions by synthesizing information from the provided wiki pages.

Instructions:
1. Read the provided wiki page contents carefully
2. Synthesize a comprehensive answer to the user's question
3. When referencing information, use [[page-slug]] format to create citations
4. If information comes from multiple sources, combine them coherently
5. If there's insufficient information, acknowledge it and suggest what might be missing
6. Structure your answer with clear sections if appropriate
7. Always cite your sources using the wiki link format [[slug]]

Example citation format:
- "According to [[machine-learning]], neural networks are..."
- "As noted in [[architecture]], the system uses..."

Format your response as markdown.`;

const SYNTHESIS_MAX_PAGES = 5;
const SYNTHESIS_CACHE_TTL_MS = 1000 * 60 * 60;

function generateQueryHash(query: string, types?: WikiPageType[], tags?: string[]): string {
  const normalizedQuery = query.toLowerCase().trim();
  const typeStr = types ? types.sort().join(",") : "";
  const tagStr = tags ? tags.sort().join(",") : "";
  const combined = `${normalizedQuery}|${typeStr}|${tagStr}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `syn-${Math.abs(hash).toString(36)}`;
}

const synthesisCacheStorage = new SynthesisCacheStorage();

export async function synthesizeAnswer(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  const llmProvider = options.skipLlm ? null : (options.llmProvider ?? getLlmProvider());
  const maxPages = options.maxPages ?? SYNTHESIS_MAX_PAGES;

  if (!options.query || options.query.trim().length === 0) {
    throw new Error("Query string is required");
  }

  const queryHash = generateQueryHash(options.query, options.types, options.tags);
  const cachedResult = await synthesisCacheStorage.findByQueryHash(queryHash);
  
  if (cachedResult && !options.skipLlm) {
    logger.info("Using cached synthesis result", { queryHash, query: options.query });
    return {
      query: cachedResult.query,
      answer: cachedResult.answer,
      citations: cachedResult.citations.map((c) => ({
        pageSlug: c.pageSlug,
        pageTitle: c.pageTitle,
        pageType: c.pageType as WikiPageType,
        relevanceScore: c.relevanceScore,
      })),
      synthesizedAt: cachedResult.createdAt,
      model: cachedResult.model,
    };
  }

  const queryResult = await queryWiki({
    query: options.query,
    types: options.types,
    tags: options.tags,
    limit: maxPages,
    includeContent: true,
    wikiFileManager: wikiManager,
  });

  if (queryResult.matches.length === 0) {
    return {
      query: options.query,
      answer: "No relevant wiki pages found for this query. Try broadening your search or adding more content to the wiki.",
      citations: [],
      synthesizedAt: Date.now(),
    };
  }

  if (!llmProvider) {
    logger.warn("No LLM provider available, returning basic summary");
    const basicAnswer = generateBasicSummary(queryResult.matches);
    return {
      query: options.query,
      answer: basicAnswer,
      citations: queryResult.matches.map((m) => ({
        pageSlug: m.page.slug,
        pageTitle: m.page.title,
        pageType: m.page.type,
        relevanceScore: m.relevanceScore,
      })),
      synthesizedAt: Date.now(),
    };
  }

  const contextSections: string[] = [];
  for (const match of queryResult.matches) {
    const content = match.content || match.page.summary || "";
    contextSections.push(`## [[${match.page.slug}]] (${match.page.type})
Title: ${match.page.title}
Summary: ${match.page.summary || "No summary"}
Content:
${content.slice(0, 2000)}
`);
  }

  const userPrompt = `Question: ${options.query}

Available wiki pages:
${contextSections.join("\n---\n")}

Please synthesize an answer to the question using the provided wiki pages. Remember to cite sources using [[slug]] format. Your answer should be within 2000 characters.`;

  const response = await llmProvider.call(SYNTHESIS_SYSTEM_PROMPT, userPrompt);

  const citations = queryResult.matches.map((m) => ({
    pageSlug: m.page.slug,
    pageTitle: m.page.title,
    pageType: m.page.type,
    relevanceScore: m.relevanceScore,
  }));

  const pageIds = queryResult.matches.map((m) => m.page.id);

  await synthesisCacheStorage.create({
    queryHash,
    query: options.query,
    answer: response.content,
    citations,
    model: response.model,
    pageIds,
    ttlMs: SYNTHESIS_CACHE_TTL_MS,
  });

  await storage.processingLog.create({
    operation: "query",
    details: {
      query: options.query,
      synthesized: true,
      model: response.model,
      citationsCount: queryResult.matches.length,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      cached: false,
    },
  });

  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "query",
    title: `LLM Synthesis: ${options.query}`,
    details: `Synthesized answer from ${queryResult.matches.length} pages using ${response.model}`,
  });

  logger.info("Synthesized answer with LLM", {
    query: options.query,
    model: response.model,
    citations: queryResult.matches.length,
  });

  return {
    query: options.query,
    answer: response.content,
    citations: queryResult.matches.map((m) => ({
      pageSlug: m.page.slug,
      pageTitle: m.page.title,
      pageType: m.page.type,
      relevanceScore: m.relevanceScore,
    })),
    synthesizedAt: Date.now(),
    model: response.model,
  };
}

function generateBasicSummary(matches: QueryMatch[]): string {
  const sections: string[] = [];
  
  sections.push("# Answer Summary\n\n");
  sections.push(`Based on ${matches.length} wiki pages:\n\n`);
  
  for (const match of matches) {
    sections.push(`## [[${match.page.slug}]]\n\n`);
    if (match.page.summary) {
      sections.push(`${match.page.summary}\n\n`);
    }
    if (match.content) {
      const preview = match.content.slice(0, 300);
      sections.push(`${preview}...\n\n`);
    }
  }
  
  sections.push("\n*Note: This is a basic summary. Enable LLM integration for synthesized answers.*\n");
  
  return sections.join("");
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
  synthesizeAnswer,
  searchWikiPages,
  getWikiPageBySlug,
  getWikiPagesByType,
  getWikiPagesByTags,
  getRecentWikiPages,
  getWikiPageGraph,
};
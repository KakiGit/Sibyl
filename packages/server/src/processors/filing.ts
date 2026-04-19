import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPageType } from "@sibyl/sdk";
import type { QueryResult } from "./query.js";

export interface FilingOptions {
  title: string;
  content: string;
  type?: WikiPageType;
  tags?: string[];
  sourcePageIds?: string[];
  wikiFileManager?: WikiFileManager;
  summary?: string;
}

export interface FilingResult {
  wikiPageId: string;
  slug: string;
  title: string;
  type: WikiPageType;
  linkedPages: string[];
  filedAt: number;
}

export interface FileQueryResultOptions {
  queryResult: QueryResult;
  title?: string;
  tags?: string[];
  wikiFileManager?: WikiFileManager;
}

function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateSummaryFromContent(content: string, maxLength: number = 200): string {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length === 0) {
    return content.slice(0, maxLength).trim();
  }
  
  const firstSentence = sentences[0].trim();
  if (firstSentence.length <= maxLength) {
    return firstSentence;
  }
  
  return firstSentence.slice(0, maxLength).trim() + "...";
}

export async function fileContent(options: FilingOptions): Promise<FilingResult> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  const now = Date.now();
  
  const type = options.type || "summary";
  const title = options.title;
  const slug = generateSlugFromTitle(title);
  const tags = options.tags || [];
  const summary = options.summary || generateSummaryFromContent(options.content);
  const sourceIds: string[] = [];
  
  const existingPage = await storage.wikiPages.findBySlug(slug);
  
  if (existingPage) {
    const wikiPageContent = {
      title,
      type,
      slug,
      content: options.content,
      summary,
      tags: [...existingPage.tags, ...tags],
      sourceIds: [...existingPage.sourceIds, ...sourceIds],
      createdAt: existingPage.createdAt,
      updatedAt: now,
    };
    
    wikiManager.updatePage(wikiPageContent);
    
    await storage.wikiPages.update(existingPage.id, {
      title,
      summary,
      tags: wikiPageContent.tags,
      sourceIds: wikiPageContent.sourceIds,
    });
    
    const linkedPages = await createWikiLinks(existingPage.id, options.sourcePageIds || []);
    
    await storage.processingLog.create({
      operation: "filing",
      wikiPageId: existingPage.id,
      details: {
        title,
        type,
        slug,
        action: "updated",
        contentLength: options.content.length,
        linkedPages: linkedPages.length,
      },
    });
    
    wikiManager.appendToLog({
      timestamp: new Date().toISOString().split("T")[0],
      operation: "filing",
      title: `${title} (updated)`,
      details: `Filed content to existing wiki page`,
    });
    
    logger.info("Filed content (updated existing page)", {
      wikiPageId: existingPage.id,
      slug,
      linkedPages: linkedPages.length,
    });
    
    return {
      wikiPageId: existingPage.id,
      slug,
      title,
      type,
      linkedPages,
      filedAt: now,
    };
  }
  
  const wikiPageContent = {
    title,
    type,
    slug,
    content: options.content,
    summary,
    tags,
    sourceIds,
    createdAt: now,
    updatedAt: now,
  };
  
  wikiManager.createPage(wikiPageContent);
  
  const dbPage = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiManager.getPagePath(type, slug),
    summary,
    tags,
    sourceIds,
  });
  
  const linkedPages = await createWikiLinks(dbPage.id, options.sourcePageIds || []);
  
  await storage.processingLog.create({
    operation: "filing",
    wikiPageId: dbPage.id,
    details: {
      title,
      type,
      slug,
      action: "created",
      contentLength: options.content.length,
      linkedPages: linkedPages.length,
    },
  });
  
  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "filing",
    title,
    details: `Created wiki page from filed content`,
  });
  
  logger.info("Filed content (created new page)", {
    wikiPageId: dbPage.id,
    slug,
    linkedPages: linkedPages.length,
  });
  
  return {
    wikiPageId: dbPage.id,
    slug,
    title,
    type,
    linkedPages,
    filedAt: now,
  };
}

export async function fileQueryResult(options: FileQueryResultOptions): Promise<FilingResult> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  const queryResult = options.queryResult;
  
  if (!queryResult.matches || queryResult.matches.length === 0) {
    throw new Error("Query result has no matches to file");
  }
  
  const title = options.title || `Query: ${queryResult.query}`;
  
  const matchedPages = queryResult.matches.map((m) => m.page);
  const allTags = new Set<string>();
  
  for (const page of matchedPages) {
    for (const tag of page.tags) {
      allTags.add(tag);
    }
  }
  
  if (options.tags) {
    for (const tag of options.tags) {
      allTags.add(tag);
    }
  }
  
  const contentSections: string[] = [];
  contentSections.push(`# ${title}\n\n`);
  contentSections.push(`This summary was generated from a query: **"${queryResult.query}"**\n\n`);
  contentSections.push(`## Related Pages\n\n`);
  
  for (const match of queryResult.matches) {
    const pageContent = wikiManager.readPage(match.page.type, match.page.slug);
    const contentPreview = pageContent?.content?.slice(0, 300) || match.page.summary || "";
    contentSections.push(`### [[${match.page.slug}]]\n\n`);
    contentSections.push(`Type: ${match.page.type}\n\n`);
    contentSections.push(`Relevance: ${match.matchType} (score: ${match.relevanceScore})\n\n`);
    if (contentPreview) {
      contentSections.push(`${contentPreview}...\n\n`);
    }
  }
  
  contentSections.push(`## Summary\n\n`);
  contentSections.push(`Found ${queryResult.total} pages matching this query.\n\n`);
  
  const content = contentSections.join("");
  const summary = `Query result for "${queryResult.query}" with ${queryResult.matches.length} top matches.`;
  
  const sourcePageIds = matchedPages.map((p) => p.id);
  
  return fileContent({
    title,
    content,
    type: "summary",
    tags: [...allTags],
    sourcePageIds,
    wikiFileManager: wikiManager,
    summary,
  });
}

export async function fileAnalysis(
  title: string,
  analysisContent: string,
  relatedPageIds: string[],
  options?: {
    tags?: string[];
    wikiFileManager?: WikiFileManager;
  }
): Promise<FilingResult> {
  return fileContent({
    title,
    content: analysisContent,
    type: "summary",
    tags: options?.tags || [],
    sourcePageIds: relatedPageIds,
    wikiFileManager: options?.wikiFileManager,
  });
}

async function createWikiLinks(fromPageId: string, toPageIds: string[]): Promise<string[]> {
  const linkedPages: string[] = [];
  
  for (const toPageId of toPageIds) {
    const targetPage = await storage.wikiPages.findById(toPageId);
    if (!targetPage) {
      logger.warn("Target page not found for linking", { toPageId });
      continue;
    }
    
    const existingLinks = await storage.wikiLinks.findByFromPageId(fromPageId);
    const alreadyLinked = existingLinks.some(
      (l) => l.toPageId === toPageId && l.relationType === "reference"
    );
    
    if (alreadyLinked) {
      linkedPages.push(toPageId);
      continue;
    }
    
    await storage.wikiLinks.create({
      fromPageId,
      toPageId,
      relationType: "reference",
    });
    
    linkedPages.push(toPageId);
    logger.debug("Created wiki link", { fromPageId, toPageId, relationType: "reference" });
  }
  
  return linkedPages;
}

export async function getFilingHistory(limit: number = 10): Promise<{
  wikiPageId: string;
  title: string;
  slug: string;
  filedAt: number;
}[]> {
  const logs = await storage.processingLog.findByOperation("filing");
  
  const filingHistory = logs
    .filter((log) => log.wikiPageId)
    .slice(0, limit)
    .map((log) => ({
      wikiPageId: log.wikiPageId!,
      title: (log.details?.title as string) || "Unknown",
      slug: (log.details?.slug as string) || "unknown",
      filedAt: log.createdAt,
    }));
  
  return filingHistory;
}

export const filingProcessor = {
  fileContent,
  fileQueryResult,
  fileAnalysis,
  getFilingHistory,
};
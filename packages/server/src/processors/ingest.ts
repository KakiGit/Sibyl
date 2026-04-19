import { readFileSync, existsSync } from "fs";
import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";
import { generateWikiContent, type LlmGeneratedContent } from "./llm-content.js";
import type { LlmProvider } from "../llm/index.js";
import type { RawResource, WikiPage } from "@sibyl/sdk";

export interface IngestOptions {
  rawResourceId?: string;
  autoProcess?: boolean;
  type?: "entity" | "concept" | "source" | "summary";
  title?: string;
  tags?: string[];
  wikiFileManager?: WikiFileManager;
  useLlm?: boolean;
  llmProvider?: LlmProvider | null;
}

export interface IngestResult {
  rawResourceId: string;
  wikiPageId: string;
  slug: string;
  title: string;
  type: WikiPage["type"];
  processed: boolean;
}

export interface IngestBatchResult {
  processed: IngestResult[];
  failed: { rawResourceId: string; error: string }[];
  total: number;
}

function extractTitleFromFilename(filename: string): string {
  const baseName = filename.replace(/\.[^/.]+$/, "");
  return baseName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function generateSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractTagsFromContent(content: string): string[] {
  const words = content.toLowerCase().split(/\s+/);
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "to", "of",
    "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
    "during", "before", "after", "above", "below", "between", "under",
    "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "and", "but", "if", "or", "because", "until", "while",
    "this", "that", "these", "those", "it", "its", "they", "them", "their",
    "we", "our", "you", "your", "he", "him", "his", "she", "her", "i", "me",
    "my", "what", "which", "who", "whom"
  ]);

  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    const cleanWord = word.replace(/[^a-z]/g, "");
    if (cleanWord.length > 3 && !stopWords.has(cleanWord)) {
      wordCounts[cleanWord] = (wordCounts[cleanWord] || 0) + 1;
    }
  }

  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return sortedWords;
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

function inferPageType(rawResource: RawResource): WikiPage["type"] {
  switch (rawResource.type) {
    case "pdf":
    case "webpage":
      return "source";
    case "text":
      return "concept";
    default:
      return "source";
  }
}

async function readRawResourceContent(rawResource: RawResource): Promise<string> {
  if (!existsSync(rawResource.contentPath)) {
    throw new Error(`Content file not found: ${rawResource.contentPath}`);
  }

  const content = readFileSync(rawResource.contentPath, "utf-8");
  return content;
}

export async function ingestRawResource(options: IngestOptions): Promise<IngestResult> {
  if (!options.rawResourceId) {
    throw new Error("rawResourceId is required");
  }

  const wikiManager = options.wikiFileManager || wikiFileManager;

  const rawResource = await storage.rawResources.findById(options.rawResourceId);
  if (!rawResource) {
    throw new Error(`Raw resource not found: ${options.rawResourceId}`);
  }

  if (rawResource.processed && !options.autoProcess) {
    logger.info("Raw resource already processed", { id: rawResource.id });
    const existingPages = await storage.wikiPages.findAll({ limit: 100 });
    const linkedPage = existingPages.find(p => p.sourceIds.includes(rawResource.id));
    
    if (linkedPage) {
      return {
        rawResourceId: rawResource.id,
        wikiPageId: linkedPage.id,
        slug: linkedPage.slug,
        title: linkedPage.title,
        type: linkedPage.type,
        processed: true,
      };
    }
  }

  let content: string;
  try {
    content = await readRawResourceContent(rawResource);
  } catch (error) {
    throw new Error(`Failed to read content: ${(error as Error).message}`);
  }

  const title = options.title || 
    (rawResource.metadata?.title as string) ||
    extractTitleFromFilename(rawResource.filename);

  const slug = generateSlugFromTitle(title);

  const type = options.type || inferPageType(rawResource);

  const tags = options.tags || 
    (rawResource.metadata?.tags as string[]) ||
    extractTagsFromContent(content);

  const summary = generateSummaryFromContent(content);

  const now = Date.now();

  const existingPage = await storage.wikiPages.findBySlug(slug);

  if (existingPage) {
    const wikiPageContent = {
      title,
      type,
      slug,
      content,
      summary,
      tags,
      sourceIds: [...existingPage.sourceIds, rawResource.id],
      createdAt: existingPage.createdAt,
      updatedAt: now,
    };

    wikiManager.updatePage(wikiPageContent);

    await storage.wikiPages.update(existingPage.id, {
      title,
      summary,
      tags,
      sourceIds: wikiPageContent.sourceIds,
    });

    await storage.rawResources.update(rawResource.id, { processed: true });

    await storage.processingLog.create({
      operation: "ingest",
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      details: {
        title,
        type,
        slug,
        action: "updated",
        contentLength: content.length,
      },
    });

    wikiManager.appendToLog({
      timestamp: new Date().toISOString().split("T")[0],
      operation: "ingest",
      title: `${title} (updated)`,
      details: `Updated wiki page from raw resource: ${rawResource.filename}`,
    });

    logger.info("Ingested raw resource (updated existing page)", {
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      slug,
    });

    return {
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      slug,
      title,
      type,
      processed: true,
    };
  }

  const wikiPageContent = {
    title,
    type,
    slug,
    content,
    summary,
    tags,
    sourceIds: [rawResource.id],
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
    sourceIds: [rawResource.id],
  });

  await storage.rawResources.update(rawResource.id, { processed: true });

  await storage.processingLog.create({
    operation: "ingest",
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    details: {
      title,
      type,
      slug,
      action: "created",
      contentLength: content.length,
    },
  });

  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "ingest",
    title,
    details: `Created wiki page from raw resource: ${rawResource.filename}`,
  });

  logger.info("Ingested raw resource (created new page)", {
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    slug,
  });

  return {
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    slug,
    title,
    type,
    processed: true,
  };
}

export async function ingestUnprocessedResources(
  options: Omit<IngestOptions, "rawResourceId"> = {}
): Promise<IngestBatchResult> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  
  const unprocessedResources = await storage.rawResources.findAll({
    processed: false,
    limit: 50,
  });

  const results: IngestBatchResult = {
    processed: [],
    failed: [],
    total: unprocessedResources.length,
  };

  for (const resource of unprocessedResources) {
    try {
      const result = await ingestRawResource({
        ...options,
        rawResourceId: resource.id,
        wikiFileManager: wikiManager,
      });
      results.processed.push(result);
    } catch (error) {
      results.failed.push({
        rawResourceId: resource.id,
        error: (error as Error).message,
      });
      logger.error("Failed to ingest raw resource", {
        rawResourceId: resource.id,
        error: (error as Error).message,
      });
    }
  }

  logger.info("Batch ingest completed", {
    processed: results.processed.length,
    failed: results.failed.length,
    total: results.total,
  });

  return results;
}

export async function reingestRawResource(
  rawResourceId: string,
  options?: Pick<IngestOptions, "wikiFileManager" | "title" | "type" | "tags">
): Promise<IngestResult> {
  const rawResource = await storage.rawResources.findById(rawResourceId);
  if (!rawResource) {
    throw new Error(`Raw resource not found: ${rawResourceId}`);
  }

  await storage.rawResources.update(rawResourceId, { processed: false });

  return ingestRawResource({
    rawResourceId,
    autoProcess: true,
    ...options,
  });
}

export async function ingestWithLlm(options: IngestOptions): Promise<IngestResult & { generatedContent: LlmGeneratedContent }> {
  if (!options.rawResourceId) {
    throw new Error("rawResourceId is required");
  }

  const wikiManager = options.wikiFileManager || wikiFileManager;

  const rawResource = await storage.rawResources.findById(options.rawResourceId);
  if (!rawResource) {
    throw new Error(`Raw resource not found: ${options.rawResourceId}`);
  }

  let content: string;
  try {
    content = await readRawResourceContent(rawResource);
  } catch (error) {
    throw new Error(`Failed to read content: ${(error as Error).message}`);
  }

  const existingPages = await storage.wikiPages.findAll({ limit: 50 });

  const generatedContent = await generateWikiContent({
    content,
    filename: rawResource.filename,
    type: options.type,
    wikiFileManager: wikiManager,
    llmProvider: options.llmProvider,
    existingPages,
  });

  const title = options.title || generatedContent.title;
  const slug = generateSlugFromTitle(title);
  const type = generatedContent.type;
  const summary = generatedContent.summary;
  const tags = options.tags || generatedContent.tags;
  const wikiContent = generatedContent.content;

  const now = Date.now();

  const existingPage = await storage.wikiPages.findBySlug(slug);

  if (existingPage) {
    const updatedPageContent = {
      title,
      type,
      slug,
      content: wikiContent,
      summary,
      tags: [...existingPage.tags, ...tags],
      sourceIds: [...existingPage.sourceIds, rawResource.id],
      createdAt: existingPage.createdAt,
      updatedAt: now,
    };

    wikiManager.updatePage(updatedPageContent);

    await storage.wikiPages.update(existingPage.id, {
      title,
      summary,
      tags: updatedPageContent.tags,
      sourceIds: updatedPageContent.sourceIds,
    });

    await createCrossReferenceLinks(existingPage.id, generatedContent.crossReferences);

    await storage.rawResources.update(rawResource.id, { processed: true });

    await storage.processingLog.create({
      operation: "ingest",
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      details: {
        title,
        type,
        slug,
        action: "updated",
        contentLength: wikiContent.length,
        llmGenerated: true,
        crossReferences: generatedContent.crossReferences.length,
      },
    });

    wikiManager.appendToLog({
      timestamp: new Date().toISOString().split("T")[0],
      operation: "ingest",
      title: `${title} (LLM-enhanced)`,
      details: `Updated wiki page from raw resource using LLM: ${rawResource.filename}`,
    });

    logger.info("Ingested raw resource with LLM (updated existing page)", {
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      slug,
      crossReferences: generatedContent.crossReferences.length,
    });

    return {
      rawResourceId: rawResource.id,
      wikiPageId: existingPage.id,
      slug,
      title,
      type,
      processed: true,
      generatedContent,
    };
  }

  wikiManager.createPage({
    title,
    type,
    slug,
    content: wikiContent,
    summary,
    tags,
    sourceIds: [rawResource.id],
    createdAt: now,
    updatedAt: now,
  });

  const dbPage = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiManager.getPagePath(type, slug),
    summary,
    tags,
    sourceIds: [rawResource.id],
  });

  await createCrossReferenceLinks(dbPage.id, generatedContent.crossReferences);

  await storage.rawResources.update(rawResource.id, { processed: true });

  await storage.processingLog.create({
    operation: "ingest",
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    details: {
      title,
      type,
      slug,
      action: "created",
      contentLength: wikiContent.length,
      llmGenerated: true,
      crossReferences: generatedContent.crossReferences.length,
    },
  });

  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "ingest",
    title: `${title} (LLM-enhanced)`,
    details: `Created wiki page from raw resource using LLM: ${rawResource.filename}`,
  });

  logger.info("Ingested raw resource with LLM (created new page)", {
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    slug,
    crossReferences: generatedContent.crossReferences.length,
  });

  return {
    rawResourceId: rawResource.id,
    wikiPageId: dbPage.id,
    slug,
    title,
    type,
    processed: true,
    generatedContent,
  };
}

async function createCrossReferenceLinks(fromPageId: string, toSlugs: string[]): Promise<void> {
  for (const toSlug of toSlugs) {
    const targetPage = await storage.wikiPages.findBySlug(toSlug);
    if (!targetPage) {
      logger.debug("Cross-reference target not found", { slug: toSlug });
      continue;
    }

    const existingLinks = await storage.wikiLinks.findByFromPageId(fromPageId);
    const alreadyLinked = existingLinks.some(
      (l) => l.toPageId === targetPage.id && l.relationType === "reference"
    );

    if (alreadyLinked) {
      continue;
    }

    await storage.wikiLinks.create({
      fromPageId,
      toPageId: targetPage.id,
      relationType: "reference",
    });

    logger.debug("Created cross-reference link", { fromPageId, toSlug, toPageId: targetPage.id });
  }
}

export const ingestProcessor = {
  ingestRawResource,
  ingestUnprocessedResources,
  reingestRawResource,
  ingestWithLlm,
};
import { eq, and, desc, like, or, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getDatabase } from "../database.js";
import { rawResources, wikiPages, wikiLinks, processingLog, embeddingsCache, wikiPageVersions, synthesisCache } from "../schema.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import type {
  RawResource,
  WikiPage,
  WikiLink,
  ProcessingLog,
  EmbeddingCache,
  WikiPageVersion,
  CreateRawResourceInput,
  CreateWikiPageInput,
  CreateWikiLinkInput,
  CreateProcessingLogInput,
  CreateWikiPageVersionInput,
  QueryWikiPagesOptions,
  QueryRawResourcesOptions,
} from "@sibyl/sdk";
import { logger } from "@sibyl/shared";
import {
  broadcastWikiPageCreated,
  broadcastWikiPageUpdated,
  broadcastWikiPageDeleted,
  broadcastRawResourceCreated,
  broadcastProcessingLogCreated,
} from "../websocket/broadcaster.js";
import { rawResourceFileManager } from "../raw/index.js";

export class RawResourceStorage {
  async create(input: CreateRawResourceInput): Promise<RawResource> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const resource: RawResource = {
      id,
      type: input.type,
      filename: input.filename,
      sourceUrl: input.sourceUrl,
      contentPath: input.contentPath,
      metadata: input.metadata,
      createdAt: now,
      processed: false,
    };

    await db.insert(rawResources).values({
      id: resource.id,
      type: resource.type,
      filename: resource.filename,
      sourceUrl: resource.sourceUrl,
      contentPath: resource.contentPath,
      metadata: resource.metadata ? JSON.stringify(resource.metadata) : null,
      createdAt: resource.createdAt,
      processed: resource.processed ? 1 : 0,
    });

    broadcastRawResourceCreated({ id: resource.id, type: resource.type, filename: resource.filename });
    rawResourceFileManager.addToIndex(resource);
    logger.debug("Created raw resource", { id: resource.id, type: resource.type });
    return resource;
  }

  async findById(id: string): Promise<RawResource | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(rawResources)
      .where(eq(rawResources.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToRawResource(results[0]);
  }

  async findAll(options: QueryRawResourcesOptions = {}): Promise<RawResource[]> {
    const db = getDatabase();
    const conditions = [];

    if (options.type) {
      conditions.push(eq(rawResources.type, options.type));
    }

    if (options.processed !== undefined) {
      conditions.push(eq(rawResources.processed, options.processed ? 1 : 0));
    }

    const baseQuery = db.select().from(rawResources);

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const orderedQuery = query.orderBy(desc(rawResources.createdAt));

    const limitedQuery = options.limit
      ? orderedQuery.limit(options.limit)
      : orderedQuery;

    const finalQuery = options.offset
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

    const results = await finalQuery;
    return results.map((r) => this.mapToRawResource(r));
  }

  async update(id: string, updates: Partial<RawResource>): Promise<RawResource | null> {
    const db = getDatabase();
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const updateData: Record<string, unknown> = {};
    if (updates.filename !== undefined) updateData.filename = updates.filename;
    if (updates.sourceUrl !== undefined) updateData.sourceUrl = updates.sourceUrl;
    if (updates.contentPath !== undefined) updateData.contentPath = updates.contentPath;
    if (updates.metadata !== undefined) updateData.metadata = JSON.stringify(updates.metadata);
    if (updates.processed !== undefined) updateData.processed = updates.processed ? 1 : 0;

    if (Object.keys(updateData).length > 0) {
      await db.update(rawResources).set(updateData).where(eq(rawResources.id, id));
      rawResourceFileManager.updateInIndex({ ...existing, ...updates });
      logger.debug("Updated raw resource", { id });
    }

    return { ...existing, ...updates };
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    const existing = await this.findById(id);
    await db.delete(rawResources).where(eq(rawResources.id, id));
    if (existing) {
      rawResourceFileManager.removeFromIndex(id);
    }
    logger.debug("Deleted raw resource", { id });
    return true;
  }

  async findBySessionId(sessionId: string): Promise<RawResource | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(rawResources)
      .where(like(rawResources.metadata, `%"sessionId":"${sessionId}"%`))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToRawResource(results[0]);
  }

  async count(options: QueryRawResourcesOptions = {}): Promise<number> {
    const db = getDatabase();
    const conditions = [];

    if (options.type) {
      conditions.push(eq(rawResources.type, options.type));
    }

    if (options.processed !== undefined) {
      conditions.push(eq(rawResources.processed, options.processed ? 1 : 0));
    }

    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(rawResources);

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const result = await query;
    return result[0]?.count ?? 0;
  }

  private mapToRawResource(row: {
    id: string;
    type: "pdf" | "image" | "webpage" | "text";
    filename: string;
    sourceUrl: string | null;
    contentPath: string;
    metadata: string | null;
    createdAt: number;
    processed: number | null;
  }): RawResource {
    return {
      id: row.id,
      type: row.type,
      filename: row.filename,
      sourceUrl: row.sourceUrl ?? undefined,
      contentPath: row.contentPath,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.createdAt,
      processed: (row.processed ?? 0) === 1,
    };
  }
}

export class WikiPageStorage {
  async create(input: CreateWikiPageInput): Promise<WikiPage> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const page: WikiPage = {
      id,
      slug: input.slug,
      title: input.title,
      type: input.type,
      contentPath: input.contentPath,
      summary: input.summary,
      tags: input.tags ?? [],
      sourceIds: input.sourceIds ?? [],
      embeddingId: undefined,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    await db.insert(wikiPages).values({
      id: page.id,
      slug: page.slug,
      title: page.title,
      type: page.type,
      contentPath: page.contentPath,
      summary: page.summary ?? null,
      tags: JSON.stringify(page.tags),
      sourceIds: JSON.stringify(page.sourceIds),
      embeddingId: page.embeddingId ?? null,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      version: page.version,
    });

    broadcastWikiPageCreated({ id: page.id, slug: page.slug, title: page.title, type: page.type });
    logger.debug("Created wiki page", { id: page.id, slug: page.slug, type: page.type });
    return page;
  }

  async findById(id: string): Promise<WikiPage | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.id, id))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToWikiPage(results[0]);
  }

  async findBySlug(slug: string): Promise<WikiPage | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiPages)
      .where(eq(wikiPages.slug, slug))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToWikiPage(results[0]);
  }

  async findByIds(ids: string[]): Promise<WikiPage[]> {
    if (ids.length === 0) return [];
    
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiPages)
      .where(inArray(wikiPages.id, ids));
    
    return results.map((r) => this.mapToWikiPage(r));
  }

  async findAll(options: QueryWikiPagesOptions = {}): Promise<WikiPage[]> {
    const db = getDatabase();
    const conditions: any[] = [];

    if (options.type) {
      conditions.push(eq(wikiPages.type, options.type));
    }

    if (options.search) {
      conditions.push(
        or(
          like(wikiPages.title, `%${options.search}%`),
          like(wikiPages.summary, `%${options.search}%`)
        )
      );
    }

    const baseQuery = db.select().from(wikiPages);

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const orderedQuery = query.orderBy(desc(wikiPages.updatedAt));

    const limitedQuery = options.limit
      ? orderedQuery.limit(options.limit)
      : orderedQuery;

    const finalQuery = options.offset
      ? limitedQuery.offset(options.offset)
      : limitedQuery;

    const results = await finalQuery;

    let pages = results.map((r) => this.mapToWikiPage(r));

    if (options.tags && options.tags.length > 0) {
      pages = pages.filter((page) =>
        options.tags!.some((tag) => page.tags.includes(tag))
      );
    }

    return pages;
  }

  async update(id: string, updates: Partial<WikiPage>, options?: { changedBy?: string; changeReason?: string; wikiFileManager?: WikiFileManager }): Promise<WikiPage | null> {
    const db = getDatabase();
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const now = Date.now();
    const newVersion = existing.version + 1;

    const wikiManager = options?.wikiFileManager || wikiFileManager;
    const existingContent = wikiManager.readPage(existing.type, existing.slug);
    
    if (existingContent) {
      const versionStorage = new WikiPageVersionStorage();
      await versionStorage.create({
        wikiPageId: existing.id,
        version: existing.version,
        title: existing.title,
        summary: existing.summary,
        tags: existing.tags,
        contentSnapshot: existingContent.content,
        changedBy: options?.changedBy,
        changeReason: options?.changeReason,
      });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: now,
      version: newVersion,
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.slug !== undefined) updateData.slug = updates.slug;
    if (updates.type !== undefined) updateData.type = updates.type;
    if (updates.contentPath !== undefined) updateData.contentPath = updates.contentPath;
    if (updates.summary !== undefined) updateData.summary = updates.summary;
    if (updates.tags !== undefined) updateData.tags = JSON.stringify(updates.tags);
    if (updates.sourceIds !== undefined) updateData.sourceIds = JSON.stringify(updates.sourceIds);
    if (updates.embeddingId !== undefined) updateData.embeddingId = updates.embeddingId;

    await db.update(wikiPages).set(updateData).where(eq(wikiPages.id, id));
    broadcastWikiPageUpdated({ id, slug: existing.slug, title: updates.title ?? existing.title, type: existing.type });
    logger.debug("Updated wiki page", { id, version: newVersion });

    return { ...existing, ...updates, updatedAt: now, version: newVersion };
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    
    const versionStorage = new WikiPageVersionStorage();
    await versionStorage.deleteByWikiPageId(id);
    
    await db.delete(wikiLinks).where(
      or(eq(wikiLinks.fromPageId, id), eq(wikiLinks.toPageId, id))
    );
    
    await db.delete(wikiPages).where(eq(wikiPages.id, id));
    broadcastWikiPageDeleted(id);
    logger.debug("Deleted wiki page and all versions", { id });
    return true;
  }

  async count(options: QueryWikiPagesOptions = {}): Promise<number> {
    const db = getDatabase();
    const conditions: any[] = [];

    if (options.type) {
      conditions.push(eq(wikiPages.type, options.type));
    }

    if (options.search) {
      conditions.push(
        or(
          like(wikiPages.title, `%${options.search}%`),
          like(wikiPages.summary, `%${options.search}%`)
        )
      );
    }

    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(wikiPages);

    const query = conditions.length > 0
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    const result = await query;
    return result[0]?.count ?? 0;
  }

  private mapToWikiPage(row: {
    id: string;
    slug: string;
    title: string;
    type: "entity" | "concept" | "source" | "summary";
    contentPath: string;
    summary: string | null;
    tags: string | null;
    sourceIds: string | null;
    embeddingId: string | null;
    createdAt: number;
    updatedAt: number;
    version: number | null;
  }): WikiPage {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      type: row.type,
      contentPath: row.contentPath,
      summary: row.summary ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      sourceIds: row.sourceIds ? JSON.parse(row.sourceIds) : [],
      embeddingId: row.embeddingId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version ?? 1,
    };
  }
}

export class WikiLinkStorage {
  async create(input: CreateWikiLinkInput): Promise<WikiLink> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const link: WikiLink = {
      id,
      fromPageId: input.fromPageId,
      toPageId: input.toPageId,
      relationType: input.relationType,
      createdAt: now,
    };

    await db.insert(wikiLinks).values({
      id: link.id,
      fromPageId: link.fromPageId,
      toPageId: link.toPageId,
      relationType: link.relationType,
      createdAt: link.createdAt,
    });

    logger.debug("Created wiki link", {
      id: link.id,
      from: link.fromPageId,
      to: link.toPageId,
    });
    return link;
  }

  async findByFromPageId(pageId: string): Promise<WikiLink[]> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiLinks)
      .where(eq(wikiLinks.fromPageId, pageId));
    return results.map((r) => this.mapToWikiLink(r));
  }

  async findByToPageId(pageId: string): Promise<WikiLink[]> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiLinks)
      .where(eq(wikiLinks.toPageId, pageId));
    return results.map((r) => this.mapToWikiLink(r));
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    await db.delete(wikiLinks).where(eq(wikiLinks.id, id));
    logger.debug("Deleted wiki link", { id });
    return true;
  }

  async deleteByPages(pageIds: string[]): Promise<void> {
    const db = getDatabase();
    await db.delete(wikiLinks).where(
      or(
        inArray(wikiLinks.fromPageId, pageIds),
        inArray(wikiLinks.toPageId, pageIds)
      )
    );
  }

  async findAllLinks(): Promise<WikiLink[]> {
    const db = getDatabase();
    const results = await db.select().from(wikiLinks);
    return results.map((r) => this.mapToWikiLink(r));
  }

  async findNeighborsBatch(pageIds: string[], limit: number = 3): Promise<Map<string, string[]>> {
    const db = getDatabase();
    const result = new Map<string, string[]>();
    
    for (const pageId of pageIds) {
      result.set(pageId, []);
    }
    
    if (pageIds.length === 0) return result;
    
    const outgoingLinks = await db
      .select()
      .from(wikiLinks)
      .where(inArray(wikiLinks.fromPageId, pageIds));
    
    const outgoingMap = new Map<string, string[]>();
    for (const link of outgoingLinks) {
      const neighbors = outgoingMap.get(link.fromPageId) || [];
      neighbors.push(link.toPageId);
      outgoingMap.set(link.fromPageId, neighbors);
    }
    
    const incomingLinks = await db
      .select()
      .from(wikiLinks)
      .where(inArray(wikiLinks.toPageId, pageIds));
    
    const incomingMap = new Map<string, string[]>();
    for (const link of incomingLinks) {
      const neighbors = incomingMap.get(link.toPageId) || [];
      neighbors.push(link.fromPageId);
      incomingMap.set(link.toPageId, neighbors);
    }
    
    for (const pageId of pageIds) {
      const outgoing = (outgoingMap.get(pageId) || []).slice(0, limit);
      const remaining = limit - outgoing.length;
      const incoming = remaining > 0 
        ? (incomingMap.get(pageId) || []).slice(0, remaining) 
        : [];
      
      const allNeighbors = [...outgoing, ...incoming];
      const uniqueNeighbors = [...new Set(allNeighbors)].filter(id => id !== pageId);
      result.set(pageId, uniqueNeighbors.slice(0, limit));
    }
    
    return result;
  }

  private mapToWikiLink(row: {
    id: string;
    fromPageId: string;
    toPageId: string;
    relationType: string;
    createdAt: number;
  }): WikiLink {
    return {
      id: row.id,
      fromPageId: row.fromPageId,
      toPageId: row.toPageId,
      relationType: row.relationType,
      createdAt: row.createdAt,
    };
  }
}

export class ProcessingLogStorage {
  async create(input: CreateProcessingLogInput): Promise<ProcessingLog> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const log: ProcessingLog = {
      id,
      operation: input.operation,
      rawResourceId: input.rawResourceId,
      wikiPageId: input.wikiPageId,
      details: input.details,
      createdAt: now,
    };

    await db.insert(processingLog).values({
      id: log.id,
      operation: log.operation,
      rawResourceId: log.rawResourceId ?? null,
      wikiPageId: log.wikiPageId ?? null,
      details: log.details ? JSON.stringify(log.details) : null,
      createdAt: log.createdAt,
    });

    broadcastProcessingLogCreated({ id: log.id, operation: log.operation });
    logger.debug("Created processing log", { id: log.id, operation: log.operation });
    return log;
  }

  async findByOperation(operation: ProcessingLog["operation"]): Promise<ProcessingLog[]> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(processingLog)
      .where(eq(processingLog.operation, operation))
      .orderBy(desc(processingLog.createdAt));
    return results.map((r) => this.mapToProcessingLog(r));
  }

  async findByRawResourceId(resourceId: string): Promise<ProcessingLog[]> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(processingLog)
      .where(eq(processingLog.rawResourceId, resourceId))
      .orderBy(desc(processingLog.createdAt));
    return results.map((r) => this.mapToProcessingLog(r));
  }

  async recent(limit: number = 10): Promise<ProcessingLog[]> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(processingLog)
      .orderBy(desc(processingLog.createdAt))
      .limit(limit);
    return results.map((r) => this.mapToProcessingLog(r));
  }

  private mapToProcessingLog(row: {
    id: string;
    operation: "ingest" | "query" | "filing" | "lint";
    rawResourceId: string | null;
    wikiPageId: string | null;
    details: string | null;
    createdAt: number;
  }): ProcessingLog {
    return {
      id: row.id,
      operation: row.operation,
      rawResourceId: row.rawResourceId ?? undefined,
      wikiPageId: row.wikiPageId ?? undefined,
      details: row.details ? JSON.parse(row.details) : undefined,
      createdAt: row.createdAt,
    };
  }
}

export class EmbeddingCacheStorage {
  async create(
    contentHash: string,
    embedding: number[],
    model: string
  ): Promise<EmbeddingCache> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const cache: EmbeddingCache = {
      id,
      contentHash,
      embedding,
      model,
      createdAt: now,
    };

    await db.insert(embeddingsCache).values({
      id: cache.id,
      contentHash: cache.contentHash,
      embedding: JSON.stringify(cache.embedding),
      model: cache.model,
      createdAt: cache.createdAt,
    });

    logger.debug("Created embedding cache", { id: cache.id, model: cache.model });
    return cache;
  }

  async findByContentHash(contentHash: string): Promise<EmbeddingCache | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(embeddingsCache)
      .where(eq(embeddingsCache.contentHash, contentHash))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToEmbeddingCache(results[0]);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDatabase();
    await db.delete(embeddingsCache).where(eq(embeddingsCache.id, id));
    logger.debug("Deleted embedding cache", { id });
    return true;
  }

  async count(): Promise<number> {
    const db = getDatabase();
    const result = await db.select({ count: sql<number>`count(*)` }).from(embeddingsCache);
    return result[0]?.count ?? 0;
  }

  private mapToEmbeddingCache(row: {
    id: string;
    contentHash: string;
    embedding: string;
    model: string;
    createdAt: number;
  }): EmbeddingCache {
    return {
      id: row.id,
      contentHash: row.contentHash,
      embedding: JSON.parse(row.embedding),
      model: row.model,
      createdAt: row.createdAt,
    };
  }
}

export class WikiPageVersionStorage {
  async create(input: CreateWikiPageVersionInput): Promise<WikiPageVersion> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();

    const version: WikiPageVersion = {
      id,
      wikiPageId: input.wikiPageId,
      version: input.version,
      title: input.title,
      summary: input.summary,
      tags: input.tags ?? [],
      contentSnapshot: input.contentSnapshot,
      changedBy: input.changedBy,
      changeReason: input.changeReason,
      createdAt: now,
    };

    await db.insert(wikiPageVersions).values({
      id: version.id,
      wikiPageId: version.wikiPageId,
      version: version.version,
      title: version.title,
      summary: version.summary ?? null,
      tags: JSON.stringify(version.tags),
      contentSnapshot: version.contentSnapshot,
      changedBy: version.changedBy ?? null,
      changeReason: version.changeReason ?? null,
      createdAt: version.createdAt,
    });

    logger.debug("Created wiki page version", { 
      id: version.id, 
      wikiPageId: version.wikiPageId, 
      version: version.version 
    });
    return version;
  }

  async findByWikiPageId(wikiPageId: string, options: { limit?: number; offset?: number } = {}): Promise<WikiPageVersion[]> {
    const db = getDatabase();
    const baseQuery = db
      .select()
      .from(wikiPageVersions)
      .where(eq(wikiPageVersions.wikiPageId, wikiPageId))
      .orderBy(desc(wikiPageVersions.version));

    const limitedQuery = options.limit ? baseQuery.limit(options.limit) : baseQuery;
    const finalQuery = options.offset ? limitedQuery.offset(options.offset) : limitedQuery;

    const results = await finalQuery;
    return results.map((r) => this.mapToWikiPageVersion(r));
  }

  async findByWikiPageIdAndVersion(wikiPageId: string, versionNumber: number): Promise<WikiPageVersion | null> {
    const db = getDatabase();
    const results = await db
      .select()
      .from(wikiPageVersions)
      .where(and(
        eq(wikiPageVersions.wikiPageId, wikiPageId),
        eq(wikiPageVersions.version, versionNumber)
      ))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToWikiPageVersion(results[0]);
  }

  async getLatestVersion(wikiPageId: string): Promise<WikiPageVersion | null> {
    const versions = await this.findByWikiPageId(wikiPageId, { limit: 1 });
    return versions.length > 0 ? versions[0] : null;
  }

  async count(wikiPageId?: string): Promise<number> {
    const db = getDatabase();
    const baseQuery = db.select({ count: sql<number>`count(*)` }).from(wikiPageVersions);
    
    const query = wikiPageId 
      ? baseQuery.where(eq(wikiPageVersions.wikiPageId, wikiPageId))
      : baseQuery;

    const result = await query;
    return result[0]?.count ?? 0;
  }

  async deleteByWikiPageId(wikiPageId: string): Promise<void> {
    const db = getDatabase();
    await db.delete(wikiPageVersions).where(eq(wikiPageVersions.wikiPageId, wikiPageId));
    logger.debug("Deleted all versions for wiki page", { wikiPageId });
  }

  private mapToWikiPageVersion(row: {
    id: string;
    wikiPageId: string;
    version: number;
    title: string;
    summary: string | null;
    tags: string | null;
    contentSnapshot: string;
    changedBy: string | null;
    changeReason: string | null;
    createdAt: number;
  }): WikiPageVersion {
    return {
      id: row.id,
      wikiPageId: row.wikiPageId,
      version: row.version,
      title: row.title,
      summary: row.summary ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : [],
      contentSnapshot: row.contentSnapshot,
      changedBy: row.changedBy ?? undefined,
      changeReason: row.changeReason ?? undefined,
      createdAt: row.createdAt,
    };
  }
}

export interface SynthesisCacheEntry {
  id: string;
  queryHash: string;
  query: string;
  answer: string;
  citations: Array<{ pageSlug: string; pageTitle: string; pageType: string; relevanceScore: number }>;
  model?: string;
  pageIds: string[];
  createdAt: number;
  expiresAt: number;
}

export interface CreateSynthesisCacheInput {
  queryHash: string;
  query: string;
  answer: string;
  citations: SynthesisCacheEntry["citations"];
  model?: string;
  pageIds: string[];
  ttlMs?: number;
}

export class SynthesisCacheStorage {
  private readonly DEFAULT_TTL_MS = 1000 * 60 * 60;

  async create(input: CreateSynthesisCacheInput): Promise<SynthesisCacheEntry> {
    const db = getDatabase();
    const now = Date.now();
    const id = ulid();
    const ttlMs = input.ttlMs ?? this.DEFAULT_TTL_MS;

    const entry: SynthesisCacheEntry = {
      id,
      queryHash: input.queryHash,
      query: input.query,
      answer: input.answer,
      citations: input.citations,
      model: input.model,
      pageIds: input.pageIds,
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    await db.insert(synthesisCache).values({
      id: entry.id,
      queryHash: entry.queryHash,
      query: entry.query,
      answer: entry.answer,
      citations: JSON.stringify(entry.citations),
      model: entry.model ?? null,
      pageIds: JSON.stringify(entry.pageIds),
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    });

    logger.debug("Created synthesis cache", { id: entry.id, queryHash: entry.queryHash });
    return entry;
  }

  async findByQueryHash(queryHash: string): Promise<SynthesisCacheEntry | null> {
    const db = getDatabase();
    const now = Date.now();
    
    const results = await db
      .select()
      .from(synthesisCache)
      .where(and(
        eq(synthesisCache.queryHash, queryHash),
        sql`${synthesisCache.expiresAt} > ${now}`
      ))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    return this.mapToSynthesisCacheEntry(results[0]);
  }

  async deleteExpired(): Promise<number> {
    const db = getDatabase();
    const now = Date.now();
    
    await db
      .delete(synthesisCache)
      .where(sql`${synthesisCache.expiresAt} < ${now}`);
    
    logger.debug("Deleted expired synthesis cache entries");
    return 0;
  }

  async clear(): Promise<void> {
    const db = getDatabase();
    await db.delete(synthesisCache);
    logger.debug("Cleared synthesis cache");
  }

  async count(): Promise<number> {
    const db = getDatabase();
    const result = await db.select({ count: sql<number>`count(*)` }).from(synthesisCache);
    return result[0]?.count ?? 0;
  }

  private mapToSynthesisCacheEntry(row: {
    id: string;
    queryHash: string;
    query: string;
    answer: string;
    citations: string | null;
    model: string | null;
    pageIds: string | null;
    createdAt: number;
    expiresAt: number;
  }): SynthesisCacheEntry {
    return {
      id: row.id,
      queryHash: row.queryHash,
      query: row.query,
      answer: row.answer,
      citations: row.citations ? JSON.parse(row.citations) : [],
      model: row.model ?? undefined,
      pageIds: row.pageIds ? JSON.parse(row.pageIds) : [],
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }
}

export const storage = {
  rawResources: new RawResourceStorage(),
  wikiPages: new WikiPageStorage(),
  wikiLinks: new WikiLinkStorage(),
  processingLog: new ProcessingLogStorage(),
  embeddingsCache: new EmbeddingCacheStorage(),
  wikiPageVersions: new WikiPageVersionStorage(),
  synthesisCache: new SynthesisCacheStorage(),
};
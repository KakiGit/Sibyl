import { getDatabase } from "../database.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { vectorSearch, storeWikiPageEmbedding, deleteWikiPageEmbedding } from "../embeddings/index.js";
import type { WikiPage, HybridSearchOptions, SearchResult } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";

export class WikiSearchStorage {
  async indexPage(page: WikiPage, wikiFileManagerOverride?: WikiFileManager): Promise<void> {
    const db = getDatabase();
    const sqlite = (db as unknown as { $client: import("bun:sqlite").Database }).$client;
    
    const wikiManager = wikiFileManagerOverride || wikiFileManager;
    const content = wikiManager.readPage(page.type, page.slug);
    
    sqlite.run(
      `INSERT INTO wiki_pages_fts (id, title, summary, content) VALUES (?, ?, ?, ?)`,
      [page.id, page.title, page.summary ?? "", content?.content ?? ""]
    );
    
    if (content?.content) {
      const fullContent = `${page.title}\n${page.summary ?? ""}\n${content.content}`;
      await storeWikiPageEmbedding(page.id, fullContent);
    }
    
    logger.debug("Indexed page in FTS5 and vec0", { id: page.id, slug: page.slug });
  }

  async updatePageIndex(page: WikiPage, wikiFileManagerOverride?: WikiFileManager): Promise<void> {
    const db = getDatabase();
    const sqlite = (db as unknown as { $client: import("bun:sqlite").Database }).$client;
    
    const wikiManager = wikiFileManagerOverride || wikiFileManager;
    const content = wikiManager.readPage(page.type, page.slug);
    
    sqlite.run(
      `UPDATE wiki_pages_fts SET title = ?, summary = ?, content = ? WHERE id = ?`,
      [page.title, page.summary ?? "", content?.content ?? "", page.id]
    );
    
    if (content?.content) {
      const fullContent = `${page.title}\n${page.summary ?? ""}\n${content.content}`;
      await storeWikiPageEmbedding(page.id, fullContent);
    }
    
    logger.debug("Updated FTS5 and vec0 index for page", { id: page.id, slug: page.slug });
  }

  async deletePageIndex(pageId: string): Promise<void> {
    const db = getDatabase();
    const sqlite = (db as unknown as { $client: import("bun:sqlite").Database }).$client;
    
    sqlite.run(`DELETE FROM wiki_pages_fts WHERE id = ?`, [pageId]);
    
    await deleteWikiPageEmbedding(pageId);
    
    logger.debug("Deleted page from FTS5 and vec0 index", { id: pageId });
  }

  async ftsSearch(query: string, limit: number = 20): Promise<Array<{ id: string; score: number }>> {
    const db = getDatabase();
    const sqlite = (db as unknown as { $client: import("bun:sqlite").Database }).$client;
    
    const sanitizedQuery = query
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (!sanitizedQuery) {
      return [];
    }
    
    const results = sqlite.query<{
      id: string;
      score: number;
    }, [string, number]>(
      `SELECT id, bm25(wiki_pages_fts) as score 
       FROM wiki_pages_fts 
       WHERE wiki_pages_fts MATCH ? 
       ORDER BY score ASC 
       LIMIT ?`
    ).all(sanitizedQuery, limit);
    
    return results.map((r) => ({
      id: r.id,
      score: Math.abs(r.score),
    }));
  }

  async hybridSearch(options: HybridSearchOptions, pages: WikiPage[]): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const keywordResults = await this.ftsSearch(options.query, limit * 2);
    
    const keywordMap = new Map<string, number>();
    for (const r of keywordResults) {
      keywordMap.set(r.id, r.score);
    }
    
    const semanticResults: Array<{ id: string; similarity: number }> = [];
    
    if (options.useSemantic !== false) {
      const vectorResults = await vectorSearch(options.query, { limit: limit * 2 });
      
      for (const result of vectorResults) {
        semanticResults.push({
          id: result.pageId,
          similarity: 1 / (1 + result.distance),
        });
      }
    }
    
    const semanticMap = new Map<string, number>();
    for (const r of semanticResults) {
      semanticMap.set(r.id, r.similarity);
    }
    
    const allIds = new Set([...keywordMap.keys(), ...semanticMap.keys()]);
    const pageMap = new Map<string, WikiPage>();
    for (const page of pages) {
      pageMap.set(page.id, page);
    }
    
    const results: SearchResult[] = [];
    
    for (const id of allIds) {
      const page = pageMap.get(id);
      if (!page) continue;
      
      if (options.type && page.type !== options.type) continue;
      
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some((t: string) => page.tags.includes(t));
        if (!hasTag) continue;
      }
      
      const keywordScore = keywordMap.get(id) ?? 0;
      const semanticScore = semanticMap.get(id);
      
      const combinedScore = semanticScore !== undefined
        ? keywordScore * 0.4 + semanticScore * 0.6
        : keywordScore;
      
      const matchType: SearchResult["matchType"] = semanticScore !== undefined
        ? keywordScore > 0 ? "hybrid" : "semantic"
        : "keyword";
      
      results.push({
        page,
        keywordScore,
        semanticScore,
        combinedScore,
        matchType,
      });
    }
    
    results.sort((a, b) => b.combinedScore - a.combinedScore);
    
    if (options.semanticThreshold !== undefined && options.useSemantic !== false) {
      const threshold = options.semanticThreshold;
      const filtered = results.filter(r => r.semanticScore !== undefined && r.combinedScore >= threshold);
      return filtered.slice(0, limit);
    }
    
    return results.slice(0, limit);
  }

  async rebuildIndex(pages: WikiPage[]): Promise<void> {
    const db = getDatabase();
    const sqlite = (db as unknown as { $client: import("bun:sqlite").Database }).$client;
    
    sqlite.run(`DELETE FROM wiki_pages_fts`);
    
    for (const page of pages) {
      await this.indexPage(page);
    }
    
    logger.info("Rebuilt FTS5 index", { count: pages.length });
  }
}

export const wikiSearchStorage = new WikiSearchStorage();
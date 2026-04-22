import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import grayMatter from "gray-matter";
import { storage } from "./storage/index.js";
import { wikiFileManager } from "./wiki/index.js";
import { rawResourceFileManager } from "./raw/index.js";
import { syncWikiLinks } from "./wiki/link-extractor.js";
import { DATA_DIR, WIKI_DIR, RAW_DIR, WIKI_PAGE_TYPES } from "@sibyl/shared";
import { logger } from "@sibyl/shared";
import type { WikiPageType } from "@sibyl/sdk";

const WIKI_PAGE_DIRS: Record<WikiPageType, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  summary: "summaries",
};

export interface SyncResult {
  wikiPages: {
    removedFromDb: number;
    addedToDb: number;
    linksRemoved: number;
    versionsRemoved: number;
  };
  rawResources: {
    removedFromDb: number;
    addedToDb: number;
  };
}

export async function syncDatabaseWithFiles(dbPath?: string): Promise<SyncResult> {
  const isTestDb = dbPath && (
    dbPath.includes("/tmp/") || 
    dbPath.includes("\\tmp\\") ||
    dbPath.includes("test") ||
    !dbPath.includes("data")
  );
  
  if (isTestDb) {
    logger.debug("Skipping sync for test database", { dbPath });
    return {
      wikiPages: { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0 },
      rawResources: { removedFromDb: 0, addedToDb: 0 },
    };
  }
  
  logger.info("Starting database-to-files sync...");
  
  const result: SyncResult = {
    wikiPages: { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0 },
    rawResources: { removedFromDb: 0, addedToDb: 0 },
  };
  
  result.wikiPages = await syncWikiPages();
  result.rawResources = await syncRawResources();
  
  logger.info("Sync completed", {
    wikiPagesRemoved: result.wikiPages.removedFromDb,
    wikiPagesAdded: result.wikiPages.addedToDb,
    rawResourcesRemoved: result.rawResources.removedFromDb,
    rawResourcesAdded: result.rawResources.addedToDb,
  });
  
  return result;
}

async function syncWikiPages(): Promise<SyncResult["wikiPages"]> {
  const stats = { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0 };
  
  const dbPages = await storage.wikiPages.findAll({ limit: 1000 });
  const wikiDir = join(DATA_DIR, WIKI_DIR.replace(`${DATA_DIR}/`, ""));
  
  const deletedPageIds: string[] = [];
  
  for (const page of dbPages) {
    const filePath = join(wikiDir, page.contentPath);
    
    if (!existsSync(filePath)) {
      deletedPageIds.push(page.id);
      await storage.wikiPages.delete(page.id);
      stats.removedFromDb++;
      logger.debug("Removed wiki page from DB (file missing)", { 
        id: page.id, 
        slug: page.slug, 
        contentPath: page.contentPath 
      });
    }
  }
  
  if (deletedPageIds.length > 0) {
    const allLinks = await storage.wikiLinks.findAllLinks();
    const linksToRemove = allLinks.filter(
      (l) => deletedPageIds.includes(l.fromPageId) || deletedPageIds.includes(l.toPageId)
    );
    
    for (const link of linksToRemove) {
      await storage.wikiLinks.delete(link.id);
      stats.linksRemoved++;
    }
    
    stats.versionsRemoved = deletedPageIds.length;
  }
  
  const dbSlugs = new Set(dbPages.map((p) => p.slug));
  const pagesToAdd: Array<{ type: WikiPageType; slug: string; content: string }> = [];
  
  for (const type of WIKI_PAGE_TYPES) {
    const typeDir = join(wikiDir, WIKI_PAGE_DIRS[type]);
    
    if (!existsSync(typeDir)) continue;
    
    const files = readdirSync(typeDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      
      const slug = file.replace(".md", "");
      
      if (dbSlugs.has(slug)) continue;
      
      const filePath = join(typeDir, file);
      try {
        const fileContent = readFileSync(filePath, "utf-8");
        const { data, content } = grayMatter(fileContent);
        
        if (data.slug && data.title && data.type) {
          pagesToAdd.push({ type: data.type as WikiPageType, slug: data.slug, content: content.trim() });
        } else {
          logger.warn("Skipping wiki file with incomplete frontmatter", { file, path: filePath });
        }
      } catch (error) {
        logger.warn("Failed to parse wiki file during sync", { 
          file, 
          path: filePath, 
          error: (error as Error).message 
        });
      }
    }
  }
  
  for (const pageInfo of pagesToAdd) {
    const filePath = join(wikiDir, WIKI_PAGE_DIRS[pageInfo.type], `${pageInfo.slug}.md`);
    const fileContent = readFileSync(filePath, "utf-8");
    const { data, content } = grayMatter(fileContent);
    
    const contentPath = `${WIKI_PAGE_DIRS[pageInfo.type]}/${pageInfo.slug}.md`;
    
    const createdPage = await storage.wikiPages.create({
      slug: data.slug || pageInfo.slug,
      title: data.title,
      type: data.type || pageInfo.type,
      contentPath,
      summary: data.summary,
      tags: data.tags || [],
      sourceIds: data.sourceIds || [],
    });
    
    await syncWikiLinks(createdPage.id, content.trim());
    
    stats.addedToDb++;
    logger.debug("Added wiki page to DB from file", { 
      id: createdPage.id, 
      slug: createdPage.slug, 
      type: createdPage.type 
    });
  }
  
  wikiFileManager.rebuildIndex();
  
  return stats;
}

async function syncRawResources(): Promise<SyncResult["rawResources"]> {
  const stats = { removedFromDb: 0, addedToDb: 0 };
  
  const dbResources = await storage.rawResources.findAll({ limit: 1000 });
  const rawDir = join(DATA_DIR, RAW_DIR.replace(`${DATA_DIR}/`, ""));
  
  const deletedResourceIds: string[] = [];
  
  for (const resource of dbResources) {
    const contentFilePath = join(rawDir, resource.contentPath);
    
    if (!existsSync(contentFilePath)) {
      deletedResourceIds.push(resource.id);
      await storage.rawResources.delete(resource.id);
      stats.removedFromDb++;
      logger.debug("Removed raw resource from DB (content file missing)", { 
        id: resource.id, 
        filename: resource.filename,
        contentPath: resource.contentPath 
      });
    }
  }
  
  const fileIndex = rawResourceFileManager.readIndex();
  const dbIds = new Set(dbResources.map((r) => r.id));
  
  for (const entry of fileIndex.entries) {
    if (dbIds.has(entry.id)) continue;
    
    const contentFilePath = join(rawDir, entry.contentPath);
    if (!existsSync(contentFilePath)) continue;
    
    await storage.rawResources.create({
      type: entry.type,
      filename: entry.filename,
      sourceUrl: entry.sourceUrl,
      contentPath: entry.contentPath,
      metadata: entry.metadata,
    });
    
    stats.addedToDb++;
    logger.debug("Added raw resource to DB from index", { 
      id: entry.id, 
      filename: entry.filename, 
      type: entry.type 
    });
  }
  
  const remainingResources = await storage.rawResources.findAll({ limit: 1000 });
  rawResourceFileManager.rebuildIndex(remainingResources);
  
  return stats;
}
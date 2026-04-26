import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import grayMatter from "gray-matter";
import { storage } from "./storage/index.js";
import { wikiFileManager } from "./wiki/index.js";
import { rawResourceFileManager } from "./raw/index.js";
import { syncWikiLinks } from "./wiki/link-extractor.js";
import { wikiSearchStorage } from "./search/index.js";
import { deleteWikiPageEmbedding } from "./embeddings/index.js";
import { DATA_DIR, WIKI_PAGE_TYPES } from "@sibyl/shared";
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
    embeddingsRemoved: number;
    embeddingsAdded: number;
  };
  rawResources: {
    removedFromDb: number;
    addedToDb: number;
  };
}

export async function syncDatabaseWithFiles(dbPath?: string): Promise<SyncResult> {
  const resolvedDbPath = dbPath ? resolve(dbPath) : resolve(DATA_DIR, "db/sibyl.db");
  
  const isTestDb = resolvedDbPath.includes("/tmp/") || 
    resolvedDbPath.includes("\\tmp\\") ||
    resolvedDbPath.includes("test") ||
    !resolvedDbPath.includes("data");
  
  if (isTestDb) {
    logger.debug("Skipping sync for test database", { dbPath: resolvedDbPath });
    return {
      wikiPages: { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0, embeddingsRemoved: 0, embeddingsAdded: 0 },
      rawResources: { removedFromDb: 0, addedToDb: 0 },
    };
  }
  
  const dataDir = dirname(dirname(resolvedDbPath));
  logger.info("Starting database-to-files sync...", { dataDir });
  
  const result: SyncResult = {
    wikiPages: { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0, embeddingsRemoved: 0, embeddingsAdded: 0 },
    rawResources: { removedFromDb: 0, addedToDb: 0 },
  };
  
  result.wikiPages = await syncWikiPages(dataDir);
  result.rawResources = await syncRawResources(dataDir);
  
  logger.info("Sync completed", {
    wikiPagesRemoved: result.wikiPages.removedFromDb,
    wikiPagesAdded: result.wikiPages.addedToDb,
    embeddingsRemoved: result.wikiPages.embeddingsRemoved,
    embeddingsAdded: result.wikiPages.embeddingsAdded,
    rawResourcesRemoved: result.rawResources.removedFromDb,
    rawResourcesAdded: result.rawResources.addedToDb,
  });
  
  return result;
}

async function syncWikiPages(dataDir: string): Promise<SyncResult["wikiPages"]> {
  const stats = { removedFromDb: 0, addedToDb: 0, linksRemoved: 0, versionsRemoved: 0, embeddingsRemoved: 0, embeddingsAdded: 0 };
  
  const dbPages = await storage.wikiPages.findAll({ limit: 1000 });
  const wikiDir = join(dataDir, "wiki");
  
  const deletedPageIds: string[] = [];
  
  for (const page of dbPages) {
    const filePath = join(wikiDir, page.contentPath);
    
    if (!existsSync(filePath)) {
      deletedPageIds.push(page.id);
      await storage.wikiPages.delete(page.id);
      await deleteWikiPageEmbedding(page.id);
      stats.removedFromDb++;
      stats.embeddingsRemoved++;
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
  const addedSlugs = new Set<string>();
  
  for (const type of WIKI_PAGE_TYPES) {
    const typeDir = join(wikiDir, WIKI_PAGE_DIRS[type]);
    
    if (!existsSync(typeDir)) continue;
    
    const files = readdirSync(typeDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      
      const fileSlug = file.replace(".md", "");
      
      if (dbSlugs.has(fileSlug) || addedSlugs.has(fileSlug)) continue;
      
      const filePath = join(typeDir, file);
      try {
        const fileContent = readFileSync(filePath, "utf-8");
        const { data, content } = grayMatter(fileContent);
        
        if (data.slug && data.title && data.type) {
          const frontmatterSlug = data.slug;
          
          if (dbSlugs.has(frontmatterSlug) || addedSlugs.has(frontmatterSlug)) {
            logger.warn("Skipping wiki file with duplicate slug", { file, slug: frontmatterSlug, path: filePath });
            continue;
          }
          
          addedSlugs.add(frontmatterSlug);
          pagesToAdd.push({ type: data.type as WikiPageType, slug: frontmatterSlug, content: content.trim() });
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
    await wikiSearchStorage.indexPage(createdPage);
    
    stats.addedToDb++;
    stats.embeddingsAdded++;
    logger.debug("Added wiki page to DB from file", { 
      id: createdPage.id, 
      slug: createdPage.slug, 
      type: createdPage.type 
    });
  }
  
  wikiFileManager.rebuildIndex();
  
  return stats;
}

async function syncRawResources(dataDir: string): Promise<SyncResult["rawResources"]> {
  const stats = { removedFromDb: 0, addedToDb: 0 };
  
  const dbResources = await storage.rawResources.findAll({ limit: 1000 });
  const rawDir = join(dataDir, "raw");
  
  const deletedResourceIds: string[] = [];
  const dbContentPaths = new Set(dbResources.map((r) => r.contentPath));
  
  for (const resource of dbResources) {
    const contentFilePath = join(dataDir, resource.contentPath.replace(`${DATA_DIR}/`, ""));
    
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
  
  for (const entry of fileIndex.entries) {
    if (dbContentPaths.has(entry.contentPath)) continue;
    
    const contentFilePath = join(dataDir, entry.contentPath.replace(`${DATA_DIR}/`, ""));
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
  
  const rawSubdirs = ["documents", "webpages", "thumbnails"];
  const fileExtensions: Record<string, "text" | "pdf" | "image" | "webpage"> = {
    ".txt": "text",
    ".md": "text",
    ".pdf": "pdf",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".gif": "image",
    ".webp": "image",
    ".html": "webpage",
  };
  
  for (const subdir of rawSubdirs) {
    const subdirPath = join(rawDir, subdir);
    if (!existsSync(subdirPath)) {
      logger.debug("Skipping non-existent subdir", { subdirPath });
      continue;
    }
    
    const files = readdirSync(subdirPath);
    logger.debug("Scanning raw subdir", { subdir, fileCount: files.length });
    
    let skipped = 0;
    let added = 0;
    
    for (const file of files) {
      if (file === "test-image.md" || file === "test.md") {
        skipped++;
        continue;
      }
      
      const ext = file.substring(file.lastIndexOf(".")).toLowerCase();
      const type = fileExtensions[ext];
      if (!type) {
        skipped++;
        continue;
      }
      
      const contentPath = `data/raw/${subdir}/${file}`;
      
      if (dbContentPaths.has(contentPath)) {
        skipped++;
        continue;
      }
      
      await storage.rawResources.create({
        type,
        filename: file,
        contentPath,
        metadata: inferMetadataFromFilename(file),
      });
      
      stats.addedToDb++;
      added++;
    }
    
logger.debug("Raw subdir scan complete", { subdir, added, skipped });
  }
  
  const remainingResources = await storage.rawResources.findAll({ limit: 1000 });
  rawResourceFileManager.rebuildIndex(remainingResources);
  
  return stats;
}

function inferMetadataFromFilename(filename: string): Record<string, unknown> | undefined {
  const sessionMatch = filename.match(/session-(ses-[a-z0-9]+)-/i) || filename.match(/session-ses-(\d+[a-z]+)/i);
  if (sessionMatch) {
    return {
      sessionId: `ses_${sessionMatch[1]}`,
      sourceType: "opencode-session",
    };
  }
  
  return undefined;
}
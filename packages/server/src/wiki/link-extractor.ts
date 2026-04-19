import { storage } from "../storage/index.js";
import { logger } from "@sibyl/shared";

const WIKI_LINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export interface ExtractedWikiLink {
  slug: string;
  position: number;
  rawMatch: string;
}

export function extractWikiLinks(content: string): ExtractedWikiLink[] {
  const links: ExtractedWikiLink[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = WIKI_LINK_PATTERN.exec(content)) !== null) {
    const slug = match[1].trim().toLowerCase();
    
    if (slug && slug.length > 0) {
      links.push({
        slug,
        position: match.index,
        rawMatch: match[0],
      });
    }
  }
  
  return links;
}

export async function syncWikiLinks(
  fromPageId: string,
  content: string,
  relationType: string = "reference"
): Promise<{ created: number; removed: number; skipped: number }> {
  const extractedLinks = extractWikiLinks(content);
  const uniqueSlugs = new Set(extractedLinks.map((l) => l.slug));
  const duplicateCount = extractedLinks.length - uniqueSlugs.size;
  
  const existingLinks = await storage.wikiLinks.findByFromPageId(fromPageId);
  const existingTargetIdsByRelation = new Map<string, Set<string>>();
  
  for (const link of existingLinks) {
    const relationSet = existingTargetIdsByRelation.get(link.relationType) || new Set();
    relationSet.add(link.toPageId);
    existingTargetIdsByRelation.set(link.relationType, relationSet);
  }
  
  const existingTargetIdsForRelation = existingTargetIdsByRelation.get(relationType) || new Set();
  
  const stats = { created: 0, removed: 0, skipped: duplicateCount };
  
  for (const link of existingLinks) {
    if (link.relationType !== relationType) continue;
    
    const targetPage = await storage.wikiPages.findById(link.toPageId);
    if (!targetPage) continue;
    
    if (!uniqueSlugs.has(targetPage.slug)) {
      await storage.wikiLinks.delete(link.id);
      stats.removed++;
      logger.debug("Removed stale wiki link", {
        fromPageId,
        toSlug: targetPage.slug,
      });
    }
  }
  
  for (const slug of uniqueSlugs) {
    const targetPage = await storage.wikiPages.findBySlug(slug);
    
    if (!targetPage) {
      stats.skipped++;
      logger.debug("Wiki link target not found", { fromPageId, toSlug: slug });
      continue;
    }
    
    if (targetPage.id === fromPageId) {
      stats.skipped++;
      logger.debug("Skipping self-referential wiki link", { pageId: fromPageId, slug });
      continue;
    }
    
    const alreadyLinked = existingTargetIdsForRelation.has(targetPage.id);
    if (alreadyLinked) {
      stats.skipped++;
      continue;
    }
    
    await storage.wikiLinks.create({
      fromPageId,
      toPageId: targetPage.id,
      relationType,
    });
    
    stats.created++;
    existingTargetIdsForRelation.add(targetPage.id);
    logger.debug("Created wiki link", { fromPageId, toSlug: slug, toPageId: targetPage.id });
  }
  
  logger.info("Wiki links synced", { fromPageId, ...stats });
  
  return stats;
}

export async function getLinkStats(): Promise<{
  totalPages: number;
  totalLinks: number;
  pagesWithOutgoingLinks: number;
  pagesWithIncomingLinks: number;
  orphans: number;
}> {
  const pages = await storage.wikiPages.findAll({ limit: 500 });
  const allLinks = await storage.wikiLinks.findAllLinks();
  
  const outgoingCounts = new Map<string, number>();
  const incomingCounts = new Map<string, number>();
  
  for (const link of allLinks) {
    outgoingCounts.set(link.fromPageId, (outgoingCounts.get(link.fromPageId) || 0) + 1);
    incomingCounts.set(link.toPageId, (incomingCounts.get(link.toPageId) || 0) + 1);
  }
  
  const orphans = pages.filter((p) => 
    !outgoingCounts.has(p.id) && !incomingCounts.has(p.id)
  ).length;
  
  return {
    totalPages: pages.length,
    totalLinks: allLinks.length,
    pagesWithOutgoingLinks: outgoingCounts.size,
    pagesWithIncomingLinks: incomingCounts.size,
    orphans,
  };
}

export const wikiLinkExtractor = {
  extractWikiLinks,
  syncWikiLinks,
  getLinkStats,
};
import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPage } from "@sibyl/sdk";

export interface LintIssue {
  type: "orphan" | "missing_page" | "stale" | "missing_reference" | "potential_conflict";
  severity: "high" | "medium" | "low";
  pageId?: string;
  pageSlug?: string;
  pageTitle?: string;
  details: string;
  suggestedAction?: string;
}

export interface LintReport {
  totalPages: number;
  totalPagesWithIssues: number;
  issues: LintIssue[];
  orphanPages: WikiPage[];
  stalePages: WikiPage[];
  missingReferences: { fromPage: WikiPage; referencedSlug: string }[];
  potentialConflicts: { page1: WikiPage; page2: WikiPage; reason: string }[];
  suggestions: string[];
  lintedAt: number;
}

export interface LintOptions {
  checkOrphans?: boolean;
  checkStale?: boolean;
  checkMissingReferences?: boolean;
  checkPotentialConflicts?: boolean;
  staleThresholdDays?: number;
  wikiFileManager?: WikiFileManager;
}

const DEFAULT_STALE_THRESHOLD_DAYS = 30;

function extractWikiLinks(content: string): string[] {
  const linkPattern = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  
  while ((match = linkPattern.exec(content)) !== null) {
    links.push(match[1]);
  }
  
  return links;
}

function isStale(page: WikiPage, thresholdDays: number): boolean {
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return (now - page.updatedAt) > thresholdMs;
}

function findSimilarTitles(pages: WikiPage[]): { page1: WikiPage; page2: WikiPage; reason: string }[] {
  const conflicts: { page1: WikiPage; page2: WikiPage; reason: string }[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const title1 = pages[i].title.toLowerCase();
      const title2 = pages[j].title.toLowerCase();
      
      if (title1 === title2 && pages[i].id !== pages[j].id) {
        conflicts.push({
          page1: pages[i],
          page2: pages[j],
          reason: "Duplicate title",
        });
        continue;
      }
      
      const words1 = title1.split(/\s+/);
      const words2 = title2.split(/\s+/);
      const commonWords = words1.filter((w) => words2.includes(w) && w.length > 3);
      
      if (commonWords.length >= 3 && pages[i].type === pages[j].type) {
        conflicts.push({
          page1: pages[i],
          page2: pages[j],
          reason: `Similar content: shares ${commonWords.length} significant words`,
        });
      }
    }
  }
  
  return conflicts;
}

export async function lintWiki(options: LintOptions = {}): Promise<LintReport> {
  const wikiManager = options.wikiFileManager || wikiFileManager;
  const staleThreshold = options.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS;
  
  const checkOrphans = options.checkOrphans ?? true;
  const checkStale = options.checkStale ?? true;
  const checkMissingReferences = options.checkMissingReferences ?? true;
  const checkPotentialConflicts = options.checkPotentialConflicts ?? true;
  
  const allPages = await storage.wikiPages.findAll({ limit: 500 });
  const issues: LintIssue[] = [];
  const orphanPages: WikiPage[] = [];
  const stalePages: WikiPage[] = [];
  const missingReferences: { fromPage: WikiPage; referencedSlug: string }[] = [];
  const potentialConflicts: { page1: WikiPage; page2: WikiPage; reason: string }[] = [];
  
  const pageIdsWithInboundLinks = new Set<string>();
  
  const allLinks = await storage.wikiLinks.findAllLinks();
  for (const link of allLinks) {
    pageIdsWithInboundLinks.add(link.toPageId);
  }
  
  if (checkOrphans) {
    for (const page of allPages) {
      if (!pageIdsWithInboundLinks.has(page.id)) {
        const outgoingLinks = await storage.wikiLinks.findByFromPageId(page.id);
        
        if (outgoingLinks.length === 0) {
          orphanPages.push(page);
          issues.push({
            type: "orphan",
            severity: "medium",
            pageId: page.id,
            pageSlug: page.slug,
            pageTitle: page.title,
            details: "Page has no incoming or outgoing links",
            suggestedAction: "Add cross-references to related pages or link from index",
          });
        }
      }
    }
  }
  
  if (checkStale) {
    for (const page of allPages) {
      if (isStale(page, staleThreshold)) {
        stalePages.push(page);
        issues.push({
          type: "stale",
          severity: "low",
          pageId: page.id,
          pageSlug: page.slug,
          pageTitle: page.title,
          details: `Page hasn't been updated in over ${staleThreshold} days`,
          suggestedAction: "Review and update content if necessary",
        });
      }
    }
  }
  
  if (checkMissingReferences) {
    const existingSlugs = new Set(allPages.map((p) => p.slug));
    
    for (const page of allPages) {
      const pageContent = wikiManager.readPage(page.type, page.slug);
      if (!pageContent) continue;
      
      const referencedSlugs = extractWikiLinks(pageContent.content);
      
      for (const refSlug of referencedSlugs) {
        if (!existingSlugs.has(refSlug)) {
          missingReferences.push({ fromPage: page, referencedSlug: refSlug });
          issues.push({
            type: "missing_reference",
            severity: "high",
            pageId: page.id,
            pageSlug: page.slug,
            pageTitle: page.title,
            details: `Page references [[${refSlug}]] which doesn't exist`,
            suggestedAction: `Create page "${refSlug}" or fix the reference`,
          });
        }
      }
    }
  }
  
  if (checkPotentialConflicts) {
    const conflicts = findSimilarTitles(allPages);
    for (const conflict of conflicts) {
      potentialConflicts.push(conflict);
      issues.push({
        type: "potential_conflict",
        severity: "medium",
        pageId: conflict.page1.id,
        pageSlug: conflict.page1.slug,
        pageTitle: conflict.page1.title,
        details: `${conflict.reason} with [[${conflict.page2.slug}]]`,
        suggestedAction: "Review both pages and merge or differentiate",
      });
    }
  }
  
  const totalPagesWithIssues = new Set(issues.map((i) => i.pageId)).size;
  
  const suggestions: string[] = [];
  
  if (orphanPages.length > 0) {
    suggestions.push(`Consider linking ${orphanPages.length} orphan pages to the wiki index or related content`);
  }
  
  if (missingReferences.length > 0) {
    suggestions.push(`Create ${missingReferences.length} missing referenced pages`);
  }
  
  if (stalePages.length > 0) {
    suggestions.push(`Review ${stalePages.length} stale pages for updates`);
  }
  
  if (potentialConflicts.length > 0) {
    suggestions.push(`Review ${potentialConflicts.length} potential content conflicts`);
  }
  
  if (allPages.length === 0) {
    suggestions.push("No wiki pages found. Start by ingesting raw resources.");
  }
  
  if (issues.length === 0 && allPages.length > 0) {
    suggestions.push("Wiki is in good health. No issues detected.");
  }
  
  const now = Date.now();
  
  await storage.processingLog.create({
    operation: "lint",
    details: {
      totalPages: allPages.length,
      totalPagesWithIssues,
      orphanCount: orphanPages.length,
      staleCount: stalePages.length,
      missingRefCount: missingReferences.length,
      conflictCount: potentialConflicts.length,
      issueCount: issues.length,
    },
  });
  
  wikiManager.appendToLog({
    timestamp: new Date().toISOString().split("T")[0],
    operation: "lint",
    title: "Wiki Health Check",
    details: `Checked ${allPages.length} pages, found ${issues.length} issues (${totalPagesWithIssues} pages affected)`,
  });
  
  logger.info("Lint completed", {
    totalPages: allPages.length,
    totalPagesWithIssues,
    issueCount: issues.length,
  });
  
  return {
    totalPages: allPages.length,
    totalPagesWithIssues,
    issues,
    orphanPages,
    stalePages,
    missingReferences,
    potentialConflicts,
    suggestions,
    lintedAt: now,
  };
}

export async function findOrphanPages(wikiFileManager?: WikiFileManager): Promise<WikiPage[]> {
  const report = await lintWiki({ checkOrphans: true, checkStale: false, checkMissingReferences: false, checkPotentialConflicts: false, wikiFileManager });
  return report.orphanPages;
}

export async function findStalePages(thresholdDays?: number, wikiFileManager?: WikiFileManager): Promise<WikiPage[]> {
  const report = await lintWiki({ checkOrphans: false, checkStale: true, checkMissingReferences: false, checkPotentialConflicts: false, staleThresholdDays: thresholdDays, wikiFileManager });
  return report.stalePages;
}

export async function findMissingReferences(wikiFileManager?: WikiFileManager): Promise<{ fromPage: WikiPage; referencedSlug: string }[]> {
  const report = await lintWiki({ checkOrphans: false, checkStale: false, checkMissingReferences: true, checkPotentialConflicts: false, wikiFileManager });
  return report.missingReferences;
}

export async function findPotentialConflicts(wikiFileManager?: WikiFileManager): Promise<{ page1: WikiPage; page2: WikiPage; reason: string }[]> {
  const report = await lintWiki({ checkOrphans: false, checkStale: false, checkMissingReferences: false, checkPotentialConflicts: true, wikiFileManager });
  return report.potentialConflicts;
}

export async function getLintHistory(limit: number = 10): Promise<{
  totalPages: number;
  totalPagesWithIssues: number;
  issueCount: number;
  lintedAt: number;
}[]> {
  const logs = await storage.processingLog.findByOperation("lint");
  
  const history = logs
    .slice(0, limit)
    .map((log) => ({
      totalPages: (log.details?.totalPages as number) || 0,
      totalPagesWithIssues: (log.details?.totalPagesWithIssues as number) || 0,
      issueCount: (log.details?.issueCount as number) || 0,
      lintedAt: log.createdAt,
    }));
  
  return history;
}

export const lintProcessor = {
  lintWiki,
  findOrphanPages,
  findStalePages,
  findMissingReferences,
  findPotentialConflicts,
  getLintHistory,
};
import { storage } from "../storage/index.js";
import type { WikiPage } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";

export interface LinkCounts {
  incoming: number;
  outgoing: number;
}

export interface GraphExpansionResult {
  page: WikiPage;
  isExpanded: boolean;
  expandedFrom?: string;
  relevanceScore: number;
  matchType: "title" | "summary" | "tags" | "content" | "expanded";
}

export interface HubScoreCache {
  scores: Map<string, number>;
  timestamp: number;
  ttlMs: number;
}

const HUB_SCORE_TTL_MS = 60000;
const NEIGHBOR_LIMIT = 3;

let linkCountsCache: Map<string, LinkCounts> | null = null;
let linkCountsCacheTime: number = 0;

export async function getLinkCounts(): Promise<Map<string, LinkCounts>> {
  const now = Date.now();
  
  if (linkCountsCache && (now - linkCountsCacheTime) < HUB_SCORE_TTL_MS) {
    return linkCountsCache;
  }
  
  const allLinks = await storage.wikiLinks.findAllLinks();
  const counts = new Map<string, LinkCounts>();
  
  for (const link of allLinks) {
    const fromCounts = counts.get(link.fromPageId) || { incoming: 0, outgoing: 0 };
    fromCounts.outgoing++;
    counts.set(link.fromPageId, fromCounts);
    
    const toCounts = counts.get(link.toPageId) || { incoming: 0, outgoing: 0 };
    toCounts.incoming++;
    counts.set(link.toPageId, toCounts);
  }
  
  linkCountsCache = counts;
  linkCountsCacheTime = now;
  
  logger.debug("Computed link counts cache", { pageCount: counts.size });
  return counts;
}

export function invalidateLinkCountsCache(): void {
  linkCountsCache = null;
  linkCountsCacheTime = 0;
}

export function computeHubScore(pageId: string, linkCounts: Map<string, LinkCounts>): number {
  const counts = linkCounts.get(pageId);
  if (!counts) return 0;
  
  const totalLinks = counts.incoming + counts.outgoing;
  if (totalLinks === 0) return 0;
  
  const maxLinks = Math.max(
    ...Array.from(linkCounts.values()).map(c => c.incoming + c.outgoing),
    1
  );
  
  return totalLinks / maxLinks;
}

export async function getNeighborPageIds(
  pageId: string,
  direction: "in" | "out" | "both" = "both",
  limit: number = NEIGHBOR_LIMIT
): Promise<string[]> {
  const neighbors: string[] = [];
  
  if (direction === "out" || direction === "both") {
    const outgoing = await storage.wikiLinks.findByFromPageId(pageId);
    for (const link of outgoing.slice(0, limit)) {
      if (!neighbors.includes(link.toPageId)) {
        neighbors.push(link.toPageId);
      }
    }
  }
  
  if (direction === "in" || direction === "both") {
    const remainingLimit = limit - neighbors.length;
    if (remainingLimit > 0) {
      const incoming = await storage.wikiLinks.findByToPageId(pageId);
      for (const link of incoming.slice(0, remainingLimit)) {
        if (!neighbors.includes(link.fromPageId)) {
          neighbors.push(link.fromPageId);
        }
      }
    }
  }
  
  return neighbors;
}

export async function getNeighborPageIdsBatch(
  pageIds: string[],
  limit: number = NEIGHBOR_LIMIT
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  
  for (const pageId of pageIds) {
    const neighbors = await getNeighborPageIds(pageId, "both", limit);
    result.set(pageId, neighbors);
  }
  
  return result;
}

export async function enrichMatchesWithGraph(
  matches: Array<{
    page: WikiPage;
    content?: string;
    relevanceScore: number;
    matchType: "title" | "summary" | "tags" | "content";
  }>,
  options?: {
    neighborLimit?: number;
    hubBoostWeight?: number;
  }
): Promise<GraphExpansionResult[]> {
  const neighborLimit = options?.neighborLimit ?? NEIGHBOR_LIMIT;
  const hubBoostWeight = options?.hubBoostWeight ?? 0.3;
  
  const linkCounts = await getLinkCounts();
  
  const enriched: GraphExpansionResult[] = [];
  const seenPageIds = new Set<string>();
  
  for (const match of matches) {
    seenPageIds.add(match.page.id);
    
    const hubScore = computeHubScore(match.page.id, linkCounts);
    const boostedScore = match.relevanceScore + match.relevanceScore * hubScore * hubBoostWeight;
    
    enriched.push({
      page: match.page,
      isExpanded: false,
      relevanceScore: Math.round(boostedScore),
      matchType: match.matchType,
    });
  }
  
  const topMatches = matches.slice(0, 5);
  for (const match of topMatches) {
    const neighbors = await getNeighborPageIds(match.page.id, "both", neighborLimit);
    
    for (const neighborId of neighbors) {
      if (seenPageIds.has(neighborId)) continue;
      
      const neighborPage = await storage.wikiPages.findById(neighborId);
      if (!neighborPage) continue;
      
      seenPageIds.add(neighborId);
      
      const neighborHubScore = computeHubScore(neighborId, linkCounts);
      const neighborScore = 10 + neighborHubScore * 20;
      
      enriched.push({
        page: neighborPage,
        isExpanded: true,
        expandedFrom: match.page.id,
        relevanceScore: Math.round(neighborScore),
        matchType: "expanded",
      });
    }
  }
  
  enriched.sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  logger.debug("Enriched matches with graph", {
    originalCount: matches.length,
    enrichedCount: enriched.length,
    expandedCount: enriched.filter(e => e.isExpanded).length,
  });
  
  return enriched;
}

export async function getNeighborSummaries(
  pageIds: string[],
  limitPerPage: number = NEIGHBOR_LIMIT
): Promise<Array<{ page: WikiPage; summary: string }>> {
  const neighbors = await getNeighborPageIdsBatch(pageIds, limitPerPage);
  
  const allNeighborIds = new Set<string>();
  for (const ids of neighbors.values()) {
    for (const id of ids) {
      allNeighborIds.add(id);
    }
  }
  
  for (const pageId of pageIds) {
    allNeighborIds.delete(pageId);
  }
  
  const neighborPages = await storage.wikiPages.findByIds(Array.from(allNeighborIds));
  
  return neighborPages
    .filter(p => p.summary)
    .map(p => ({
      page: p,
      summary: p.summary || "",
    }));
}

export const graphTraversal = {
  getLinkCounts,
  invalidateLinkCountsCache,
  computeHubScore,
  getNeighborPageIds,
  getNeighborPageIdsBatch,
  enrichMatchesWithGraph,
  getNeighborSummaries,
};
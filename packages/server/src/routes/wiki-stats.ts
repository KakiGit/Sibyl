import type { FastifyInstance } from "fastify";
import { storage } from "../storage/index.js";
import { wikiFileManager, WikiFileManager } from "../wiki/index.js";

export interface WikiStatsRouteOptions {
  wikiFileManager?: WikiFileManager;
}

export interface WikiStats {
  totalPages: number;
  pagesByType: {
    entity: number;
    concept: number;
    source: number;
    summary: number;
  };
  totalTags: number;
  tagsDistribution: Record<string, number>;
  averageContentLength: number;
  totalContentLength: number;
  recentPages: Array<{
    id: string;
    slug: string;
    title: string;
    type: string;
    updatedAt: number;
  }>;
  oldestPage: {
    id: string;
    slug: string;
    title: string;
    createdAt: number;
  } | null;
  newestPage: {
    id: string;
    slug: string;
    title: string;
    createdAt: number;
  } | null;
  pagesWithSummary: number;
  pagesWithTags: number;
  pagesWithLinks: number;
}

export async function registerWikiStatsRoutes(fastify: FastifyInstance, options?: WikiStatsRouteOptions) {
  const wikiManager = options?.wikiFileManager || wikiFileManager;
  
  fastify.get("/api/wiki-stats", async () => {
    const pages = await storage.wikiPages.findAll({ limit: 500 });
    
    const pagesByType: WikiStats["pagesByType"] = {
      entity: 0,
      concept: 0,
      source: 0,
      summary: 0,
    };
    
    const tagsDistribution: Record<string, number> = {};
    let totalContentLength = 0;
    let pagesWithSummary = 0;
    let pagesWithTags = 0;
    let pagesWithLinks = 0;
    
    const recentPages: WikiStats["recentPages"] = [];
    
    let oldestPage: WikiStats["oldestPage"] = null;
    let newestPage: WikiStats["newestPage"] = null;
    
    for (const page of pages) {
      pagesByType[page.type as keyof WikiStats["pagesByType"]]++;
      
      if (page.tags && page.tags.length > 0) {
        pagesWithTags++;
        for (const tag of page.tags) {
          tagsDistribution[tag] = (tagsDistribution[tag] || 0) + 1;
        }
      }
      
      if (page.summary) {
        pagesWithSummary++;
      }
      
      const content = wikiManager.readPage(page.type, page.slug);
      if (content) {
        const contentLength = content.content.length;
        totalContentLength += contentLength;
        
        if (content.content.includes("[[")) {
          pagesWithLinks++;
        }
      }
      
      if (!oldestPage || page.createdAt < oldestPage.createdAt) {
        oldestPage = {
          id: page.id,
          slug: page.slug,
          title: page.title,
          createdAt: page.createdAt,
        };
      }
      
      if (!newestPage || page.createdAt > newestPage.createdAt) {
        newestPage = {
          id: page.id,
          slug: page.slug,
          title: page.title,
          createdAt: page.createdAt,
        };
      }
    }
    
    const sortedByUpdated = [...pages].sort((a, b) => b.updatedAt - a.updatedAt);
    recentPages.push(...sortedByUpdated.slice(0, 5).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      type: p.type,
      updatedAt: p.updatedAt,
    })));
    
    const stats: WikiStats = {
      totalPages: pages.length,
      pagesByType,
      totalTags: Object.keys(tagsDistribution).length,
      tagsDistribution,
      averageContentLength: pages.length > 0 ? Math.round(totalContentLength / pages.length) : 0,
      totalContentLength,
      recentPages,
      oldestPage,
      newestPage,
      pagesWithSummary,
      pagesWithTags,
      pagesWithLinks,
    };
    
    return { data: stats };
  });
  
  fastify.get("/api/wiki-stats/tags", async () => {
    const pages = await storage.wikiPages.findAll({ limit: 500 });
    
    const tagsDistribution: Record<string, number> = {};
    
    for (const page of pages) {
      if (page.tags && page.tags.length > 0) {
        for (const tag of page.tags) {
          tagsDistribution[tag] = (tagsDistribution[tag] || 0) + 1;
        }
      }
    }
    
    const sortedTags = Object.entries(tagsDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
    
    return { data: sortedTags };
  });
  
  fastify.get("/api/wiki-stats/activity", async () => {
    const pages = await storage.wikiPages.findAll({ limit: 500 });
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    const activity = {
      last24Hours: 0,
      lastWeek: 0,
      lastMonth: 0,
      older: 0,
    };
    
    for (const page of pages) {
      const age = now - page.updatedAt;
      if (age < oneDay) {
        activity.last24Hours++;
      } else if (age < oneWeek) {
        activity.lastWeek++;
      } else if (age < oneMonth) {
        activity.lastMonth++;
      } else {
        activity.older++;
      }
    }
    
    return { data: activity };
  });
}
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { RAW_DIR, RAW_INDEX_FILE, DATA_DIR } from "@sibyl/shared";
import { logger } from "@sibyl/shared";
import type { RawResource } from "@sibyl/sdk";

export interface RawResourceIndexEntry {
  id: string;
  type: RawResource["type"];
  filename: string;
  sourceUrl?: string;
  contentPath: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  processed: boolean;
}

export interface RawResourceIndex {
  version: number;
  updatedAt: number;
  totalResources: number;
  entries: RawResourceIndexEntry[];
  stats: {
    pdfCount: number;
    imageCount: number;
    webpageCount: number;
    textCount: number;
    processedCount: number;
    unprocessedCount: number;
  };
}

export class RawResourceFileManager {
  private rawDir: string;
  private indexPath: string;

  constructor(baseDir?: string) {
    const base = baseDir || DATA_DIR;
    this.rawDir = join(base, RAW_DIR.replace(`${DATA_DIR}/`, ""));
    this.indexPath = join(this.rawDir, "index.json");
    this.ensureRawStructure();
  }

  private ensureRawStructure(): void {
    if (!existsSync(this.rawDir)) {
      mkdirSync(this.rawDir, { recursive: true });
    }

    const subdirs = ["documents", "webpages", "thumbnails"];
    for (const subdir of subdirs) {
      const dir = join(this.rawDir, subdir);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    if (!existsSync(this.indexPath)) {
      this.writeIndex(this.generateEmptyIndex());
    }
  }

  private generateEmptyIndex(): RawResourceIndex {
    return {
      version: 1,
      updatedAt: Date.now(),
      totalResources: 0,
      entries: [],
      stats: {
        pdfCount: 0,
        imageCount: 0,
        webpageCount: 0,
        textCount: 0,
        processedCount: 0,
        unprocessedCount: 0,
      },
    };
  }

  private writeIndex(index: RawResourceIndex): void {
    const dir = dirname(this.indexPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
    logger.debug("Updated raw resource index", { 
      totalResources: index.totalResources,
      path: this.indexPath 
    });
  }

  readIndex(): RawResourceIndex {
    if (!existsSync(this.indexPath)) {
      return this.generateEmptyIndex();
    }

    try {
      const content = readFileSync(this.indexPath, "utf-8");
      return JSON.parse(content) as RawResourceIndex;
    } catch (error) {
      logger.warn("Failed to read raw resource index, generating new one", { 
        error: (error as Error).message 
      });
      return this.generateEmptyIndex();
    }
  }

  addToIndex(resource: RawResource): void {
    const index = this.readIndex();
    
    const existingIndex = index.entries.findIndex((e) => e.id === resource.id);
    const entry: RawResourceIndexEntry = {
      id: resource.id,
      type: resource.type,
      filename: resource.filename,
      sourceUrl: resource.sourceUrl,
      contentPath: resource.contentPath,
      metadata: resource.metadata,
      createdAt: resource.createdAt,
      processed: resource.processed,
    };

    if (existingIndex !== -1) {
      index.entries[existingIndex] = entry;
    } else {
      index.entries.push(entry);
    }

    this.updateStats(index);
    index.updatedAt = Date.now();
    index.totalResources = index.entries.length;
    
    this.writeIndex(index);
    logger.debug("Added raw resource to index", { id: resource.id, type: resource.type });
  }

  updateInIndex(resource: RawResource): void {
    this.addToIndex(resource);
  }

  removeFromIndex(resourceId: string): void {
    const index = this.readIndex();
    
    const initialLength = index.entries.length;
    index.entries = index.entries.filter((e) => e.id !== resourceId);
    
    if (index.entries.length !== initialLength) {
      this.updateStats(index);
      index.updatedAt = Date.now();
      index.totalResources = index.entries.length;
      this.writeIndex(index);
      logger.debug("Removed raw resource from index", { id: resourceId });
    }
  }

  findById(id: string): RawResourceIndexEntry | null {
    const index = this.readIndex();
    return index.entries.find((e) => e.id === id) || null;
  }

  findByType(type: RawResource["type"]): RawResourceIndexEntry[] {
    const index = this.readIndex();
    return index.entries.filter((e) => e.type === type);
  }

  findUnprocessed(): RawResourceIndexEntry[] {
    const index = this.readIndex();
    return index.entries.filter((e) => !e.processed);
  }

  private updateStats(index: RawResourceIndex): void {
    const entries = index.entries;
    
    index.stats = {
      pdfCount: entries.filter((e) => e.type === "pdf").length,
      imageCount: entries.filter((e) => e.type === "image").length,
      webpageCount: entries.filter((e) => e.type === "webpage").length,
      textCount: entries.filter((e) => e.type === "text").length,
      processedCount: entries.filter((e) => e.processed).length,
      unprocessedCount: entries.filter((e) => !e.processed).length,
    };
  }

  rebuildIndex(resources: RawResource[]): void {
    const index: RawResourceIndex = {
      version: 1,
      updatedAt: Date.now(),
      totalResources: resources.length,
      entries: resources.map((r) => ({
        id: r.id,
        type: r.type,
        filename: r.filename,
        sourceUrl: r.sourceUrl,
        contentPath: r.contentPath,
        metadata: r.metadata,
        createdAt: r.createdAt,
        processed: r.processed,
      })),
      stats: {
        pdfCount: 0,
        imageCount: 0,
        webpageCount: 0,
        textCount: 0,
        processedCount: 0,
        unprocessedCount: 0,
      },
    };

    this.updateStats(index);
    this.writeIndex(index);
    
    logger.info("Rebuilt raw resource index", { 
      totalResources: resources.length,
      path: this.indexPath 
    });
  }

  getIndexPath(): string {
    return this.indexPath;
  }

  getRawDir(): string {
    return this.rawDir;
  }

  getStats(): RawResourceIndex["stats"] {
    const index = this.readIndex();
    return index.stats;
  }
}

export const rawResourceFileManager = new RawResourceFileManager();
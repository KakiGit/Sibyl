import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { RawResourceFileManager } from "./index.js";
import type { RawResource } from "@sibyl/sdk";

describe("RawResourceFileManager", () => {
  let tempDir: string;
  let manager: RawResourceFileManager;

  beforeEach(() => {
    tempDir = join(process.cwd(), "test-temp-raw-" + Date.now());
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
    mkdirSync(tempDir, { recursive: true });
    manager = new RawResourceFileManager(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  describe("constructor", () => {
    it("should create raw directory structure", () => {
      expect(existsSync(join(tempDir, "raw"))).toBe(true);
      expect(existsSync(join(tempDir, "raw", "documents"))).toBe(true);
      expect(existsSync(join(tempDir, "raw", "webpages"))).toBe(true);
      expect(existsSync(join(tempDir, "raw", "thumbnails"))).toBe(true);
    });

    it("should create empty index.json file", () => {
      const indexPath = join(tempDir, "raw", "index.json");
      expect(existsSync(indexPath)).toBe(true);
      
      const content = JSON.parse(readFileSync(indexPath, "utf-8"));
      expect(content.version).toBe(1);
      expect(content.totalResources).toBe(0);
      expect(content.entries).toEqual([]);
    });
  });

  describe("readIndex", () => {
    it("should return empty index when file does not exist", () => {
      rmSync(join(tempDir, "raw", "index.json"));
      const index = manager.readIndex();
      expect(index.totalResources).toBe(0);
      expect(index.entries).toEqual([]);
    });

    it("should return parsed index when file exists", () => {
      const index = manager.readIndex();
      expect(index.version).toBe(1);
      expect(index).toHaveProperty("stats");
    });
  });

  describe("addToIndex", () => {
    it("should add a raw resource to the index", () => {
      const resource: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "test-document.pdf",
        contentPath: "/path/to/document.pdf",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(resource);

      const index = manager.readIndex();
      expect(index.totalResources).toBe(1);
      expect(index.entries.length).toBe(1);
      expect(index.entries[0].id).toBe("test-id-1");
      expect(index.entries[0].type).toBe("pdf");
      expect(index.stats.pdfCount).toBe(1);
      expect(index.stats.unprocessedCount).toBe(1);
    });

    it("should update existing resource if id already exists", () => {
      const resource1: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "test-document.pdf",
        contentPath: "/path/to/document.pdf",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(resource1);

      const resource2: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "updated-document.pdf",
        contentPath: "/path/to/updated.pdf",
        createdAt: Date.now(),
        processed: true,
      };

      manager.addToIndex(resource2);

      const index = manager.readIndex();
      expect(index.totalResources).toBe(1);
      expect(index.entries.length).toBe(1);
      expect(index.entries[0].filename).toBe("updated-document.pdf");
      expect(index.entries[0].processed).toBe(true);
      expect(index.stats.processedCount).toBe(1);
    });

    it("should add multiple resources and update stats", () => {
      const resources: RawResource[] = [
        { id: "pdf-1", type: "pdf", filename: "doc1.pdf", contentPath: "/p1", createdAt: Date.now(), processed: true },
        { id: "pdf-2", type: "pdf", filename: "doc2.pdf", contentPath: "/p2", createdAt: Date.now(), processed: false },
        { id: "web-1", type: "webpage", filename: "page.html", contentPath: "/w1", createdAt: Date.now(), processed: true },
        { id: "img-1", type: "image", filename: "photo.jpg", contentPath: "/i1", createdAt: Date.now(), processed: false },
        { id: "txt-1", type: "text", filename: "note.txt", contentPath: "/t1", createdAt: Date.now(), processed: true },
      ];

      for (const r of resources) {
        manager.addToIndex(r);
      }

      const index = manager.readIndex();
      expect(index.totalResources).toBe(5);
      expect(index.stats.pdfCount).toBe(2);
      expect(index.stats.webpageCount).toBe(1);
      expect(index.stats.imageCount).toBe(1);
      expect(index.stats.textCount).toBe(1);
      expect(index.stats.processedCount).toBe(3);
      expect(index.stats.unprocessedCount).toBe(2);
    });
  });

  describe("removeFromIndex", () => {
    it("should remove a resource from the index", () => {
      const resource: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "test-document.pdf",
        contentPath: "/path/to/document.pdf",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(resource);
      manager.removeFromIndex("test-id-1");

      const index = manager.readIndex();
      expect(index.totalResources).toBe(0);
      expect(index.entries).toEqual([]);
    });

    it("should not modify index if id does not exist", () => {
      const resource: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "test-document.pdf",
        contentPath: "/path/to/document.pdf",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(resource);
      manager.removeFromIndex("non-existent-id");

      const index = manager.readIndex();
      expect(index.totalResources).toBe(1);
      expect(index.entries.length).toBe(1);
    });
  });

  describe("findById", () => {
    it("should find a resource by id", () => {
      const resource: RawResource = {
        id: "test-id-1",
        type: "pdf",
        filename: "test-document.pdf",
        contentPath: "/path/to/document.pdf",
        createdAt: Date.now(),
        processed: false,
        metadata: { author: "test" },
      };

      manager.addToIndex(resource);

      const found = manager.findById("test-id-1");
      expect(found).not.toBeNull();
      expect(found?.id).toBe("test-id-1");
      expect(found?.metadata?.author).toBe("test");
    });

    it("should return null if not found", () => {
      const found = manager.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findByType", () => {
    it("should find all resources of a specific type", () => {
      const resources: RawResource[] = [
        { id: "pdf-1", type: "pdf", filename: "doc1.pdf", contentPath: "/p1", createdAt: Date.now(), processed: true },
        { id: "pdf-2", type: "pdf", filename: "doc2.pdf", contentPath: "/p2", createdAt: Date.now(), processed: false },
        { id: "web-1", type: "webpage", filename: "page.html", contentPath: "/w1", createdAt: Date.now(), processed: true },
      ];

      for (const r of resources) {
        manager.addToIndex(r);
      }

      const pdfs = manager.findByType("pdf");
      expect(pdfs.length).toBe(2);
      expect(pdfs.every(e => e.type === "pdf")).toBe(true);
    });

    it("should return empty array if no resources of type", () => {
      const webs = manager.findByType("webpage");
      expect(webs).toEqual([]);
    });
  });

  describe("findUnprocessed", () => {
    it("should find all unprocessed resources", () => {
      const resources: RawResource[] = [
        { id: "p1", type: "pdf", filename: "doc1.pdf", contentPath: "/p1", createdAt: Date.now(), processed: true },
        { id: "p2", type: "pdf", filename: "doc2.pdf", contentPath: "/p2", createdAt: Date.now(), processed: false },
        { id: "p3", type: "text", filename: "note.txt", contentPath: "/t1", createdAt: Date.now(), processed: false },
      ];

      for (const r of resources) {
        manager.addToIndex(r);
      }

      const unprocessed = manager.findUnprocessed();
      expect(unprocessed.length).toBe(2);
      expect(unprocessed.every(e => !e.processed)).toBe(true);
    });
  });

  describe("rebuildIndex", () => {
    it("should rebuild the index from provided resources", () => {
      const resources: RawResource[] = [
        { id: "r1", type: "pdf", filename: "doc.pdf", contentPath: "/p1", createdAt: Date.now(), processed: true },
        { id: "r2", type: "webpage", filename: "page.html", contentPath: "/w1", createdAt: Date.now(), processed: false },
      ];

      manager.rebuildIndex(resources);

      const index = manager.readIndex();
      expect(index.totalResources).toBe(2);
      expect(index.entries.length).toBe(2);
      expect(index.stats.pdfCount).toBe(1);
      expect(index.stats.webpageCount).toBe(1);
    });

    it("should replace existing entries", () => {
      const initialResource: RawResource = {
        id: "old-id",
        type: "pdf",
        filename: "old.pdf",
        contentPath: "/old",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(initialResource);

      const newResources: RawResource[] = [
        { id: "new-1", type: "text", filename: "new.txt", contentPath: "/n1", createdAt: Date.now(), processed: true },
      ];

      manager.rebuildIndex(newResources);

      const index = manager.readIndex();
      expect(index.totalResources).toBe(1);
      expect(index.entries[0].id).toBe("new-1");
    });
  });

  describe("getStats", () => {
    it("should return current statistics", () => {
      const resources: RawResource[] = [
        { id: "p1", type: "pdf", filename: "doc1.pdf", contentPath: "/p1", createdAt: Date.now(), processed: true },
        { id: "p2", type: "image", filename: "img.jpg", contentPath: "/i1", createdAt: Date.now(), processed: false },
      ];

      for (const r of resources) {
        manager.addToIndex(r);
      }

      const stats = manager.getStats();
      expect(stats.pdfCount).toBe(1);
      expect(stats.imageCount).toBe(1);
      expect(stats.processedCount).toBe(1);
      expect(stats.unprocessedCount).toBe(1);
    });
  });

  describe("updateInIndex", () => {
    it("should update an existing resource", () => {
      const resource: RawResource = {
        id: "test-id",
        type: "pdf",
        filename: "original.pdf",
        contentPath: "/original",
        createdAt: Date.now(),
        processed: false,
      };

      manager.addToIndex(resource);

      const updated: RawResource = {
        ...resource,
        filename: "updated.pdf",
        processed: true,
      };

      manager.updateInIndex(updated);

      const index = manager.readIndex();
      expect(index.entries[0].filename).toBe("updated.pdf");
      expect(index.entries[0].processed).toBe(true);
      expect(index.stats.processedCount).toBe(1);
    });
  });

  describe("getIndexPath and getRawDir", () => {
    it("should return correct paths", () => {
      expect(manager.getIndexPath()).toBe(join(tempDir, "raw", "index.json"));
      expect(manager.getRawDir()).toBe(join(tempDir, "raw"));
    });
  });
});
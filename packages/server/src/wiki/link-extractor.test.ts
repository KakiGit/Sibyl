import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { extractWikiLinks, syncWikiLinks, getLinkStats } from "./link-extractor.js";
import { storage } from "../storage/index.js";
import { wikiFileManager } from "./file-manager.js";
import type { WikiPage } from "@sibyl/sdk";

describe("Wiki Link Extractor", () => {
  describe("extractWikiLinks", () => {
    it("should extract single wiki link", () => {
      const content = "This page references [[machine-learning]].";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(1);
      expect(links[0].slug).toBe("machine-learning");
      expect(links[0].rawMatch).toBe("[[machine-learning]]");
    });

    it("should extract multiple wiki links", () => {
      const content = "See [[ai]] and [[neural-networks]] for more info.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(2);
      expect(links[0].slug).toBe("ai");
      expect(links[1].slug).toBe("neural-networks");
    });

    it("should handle duplicate links", () => {
      const content = "[[python]] is great. [[python]] is also popular.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(2);
      expect(links[0].slug).toBe("python");
      expect(links[1].slug).toBe("python");
    });

    it("should normalize slug to lowercase", () => {
      const content = "[[Machine-Learning]] and [[AI]]";
      const links = extractWikiLinks(content);
      
      expect(links[0].slug).toBe("machine-learning");
      expect(links[1].slug).toBe("ai");
    });

    it("should handle empty brackets", () => {
      const content = "This has [[]] empty brackets.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(0);
    });

    it("should handle no links", () => {
      const content = "This content has no wiki links.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(0);
    });

    it("should extract links with spaces", () => {
      const content = "[[machine learning]] references.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(1);
      expect(links[0].slug).toBe("machine learning");
    });

    it("should handle links with special characters", () => {
      const content = "[[c++]] and [[node.js]] are languages.";
      const links = extractWikiLinks(content);
      
      expect(links.length).toBe(2);
      expect(links[0].slug).toBe("c++");
      expect(links[1].slug).toBe("node.js");
    });
  });

  describe("syncWikiLinks", () => {
    let page1: WikiPage;
    let page2: WikiPage;
    let page3: WikiPage;

    beforeEach(async () => {
      page1 = await storage.wikiPages.create({
        slug: "test-page-1",
        title: "Test Page 1",
        type: "concept",
        contentPath: "/tmp/test-page-1.md",
      });

      page2 = await storage.wikiPages.create({
        slug: "test-page-2",
        title: "Test Page 2",
        type: "concept",
        contentPath: "/tmp/test-page-2.md",
      });

      page3 = await storage.wikiPages.create({
        slug: "test-page-3",
        title: "Test Page 3",
        type: "concept",
        contentPath: "/tmp/test-page-3.md",
      });
    });

    afterEach(async () => {
      await storage.wikiPages.delete(page1.id);
      await storage.wikiPages.delete(page2.id);
      await storage.wikiPages.delete(page3.id);
    });

    it("should create wiki links for existing pages", async () => {
      const content = "This references [[test-page-2]] and [[test-page-3]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(2);
      expect(stats.skipped).toBe(0);
      expect(stats.removed).toBe(0);

      const outgoingLinks = await storage.wikiLinks.findByFromPageId(page1.id);
      expect(outgoingLinks.length).toBe(2);
    });

    it("should skip links to non-existent pages", async () => {
      const content = "This references [[non-existent-page]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(0);
      expect(stats.skipped).toBe(1);
      expect(stats.removed).toBe(0);
    });

    it("should skip self-referential links", async () => {
      const content = "This references [[test-page-1]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(0);
      expect(stats.skipped).toBe(1);
    });

    it("should remove stale links", async () => {
      await storage.wikiLinks.create({
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "reference",
      });

      const content = "This now only references [[test-page-3]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(1);
      expect(stats.removed).toBe(1);

      const outgoingLinks = await storage.wikiLinks.findByFromPageId(page1.id);
      expect(outgoingLinks.length).toBe(1);
      expect(outgoingLinks[0].toPageId).toBe(page3.id);
    });

    it("should not duplicate existing links", async () => {
      await storage.wikiLinks.create({
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "reference",
      });

      const content = "This references [[test-page-2]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(0);
      expect(stats.skipped).toBe(1);

      const outgoingLinks = await storage.wikiLinks.findByFromPageId(page1.id);
      expect(outgoingLinks.length).toBe(1);
    });

    it("should handle multiple links to the same page", async () => {
      const content = "[[test-page-2]] is mentioned twice: [[test-page-2]].";
      const stats = await syncWikiLinks(page1.id, content);

      expect(stats.created).toBe(1);
      expect(stats.skipped).toBe(1);

      const outgoingLinks = await storage.wikiLinks.findByFromPageId(page1.id);
      expect(outgoingLinks.length).toBe(1);
    });

    it("should respect relationType", async () => {
      await storage.wikiLinks.create({
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "related",
      });

      const content = "[[test-page-2]] reference.";
      const stats = await syncWikiLinks(page1.id, content, "reference");

      expect(stats.created).toBe(1);

      const outgoingLinks = await storage.wikiLinks.findByFromPageId(page1.id);
      expect(outgoingLinks.length).toBe(2);
      
      const referenceLink = outgoingLinks.find((l) => l.relationType === "reference");
      const relatedLink = outgoingLinks.find((l) => l.relationType === "related");
      expect(referenceLink).toBeDefined();
      expect(relatedLink).toBeDefined();
    });
  });

  describe("getLinkStats", () => {
    beforeEach(async () => {
      const pages = await storage.wikiPages.findAll({ limit: 100 });
      for (const page of pages) {
        await storage.wikiPages.delete(page.id);
      }

      const allLinks = await storage.wikiLinks.findAllLinks();
      for (const link of allLinks) {
        await storage.wikiLinks.delete(link.id);
      }
    });

    it("should return empty stats for empty database", async () => {
      const stats = await getLinkStats();

      expect(stats.totalPages).toBe(0);
      expect(stats.totalLinks).toBe(0);
      expect(stats.orphans).toBe(0);
    });

    it("should count pages and links correctly", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "stats-page-1",
        title: "Stats Page 1",
        type: "concept",
        contentPath: "/tmp/stats-1.md",
      });

      const page2 = await storage.wikiPages.create({
        slug: "stats-page-2",
        title: "Stats Page 2",
        type: "concept",
        contentPath: "/tmp/stats-2.md",
      });

      await storage.wikiLinks.create({
        fromPageId: page1.id,
        toPageId: page2.id,
        relationType: "reference",
      });

      const stats = await getLinkStats();

      expect(stats.totalPages).toBe(2);
      expect(stats.totalLinks).toBe(1);
      expect(stats.pagesWithOutgoingLinks).toBe(1);
      expect(stats.pagesWithIncomingLinks).toBe(1);
      expect(stats.orphans).toBe(0);

      await storage.wikiPages.delete(page1.id);
      await storage.wikiPages.delete(page2.id);
    });

    it("should identify orphan pages", async () => {
      const page1 = await storage.wikiPages.create({
        slug: "orphan-page",
        title: "Orphan Page",
        type: "concept",
        contentPath: "/tmp/orphan.md",
      });

      const stats = await getLinkStats();

      expect(stats.orphans).toBe(1);

      await storage.wikiPages.delete(page1.id);
    });
  });
});
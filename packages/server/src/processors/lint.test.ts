import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createDatabase, migrateDatabase, closeDatabase, setDatabase } from "../index.js";
import { storage } from "../storage/index.js";
import { WikiFileManager } from "../wiki/index.js";
import { lintWiki, findOrphanPages, findMissingReferences, getLintHistory } from "./lint.js";

let testDbDir: string;
let testDbPath: string;
let testWikiDir: string;
let wikiManager: WikiFileManager;

beforeEach(async () => {
  testDbDir = join(tmpdir(), `sibyl-lint-test-${Date.now()}`);
  mkdirSync(testDbDir, { recursive: true });
  testDbPath = join(testDbDir, "test.db");
  testWikiDir = join(testDbDir, "wiki");

  const db = createDatabase(testDbPath);
  migrateDatabase(db);
  setDatabase(db);

  wikiManager = new WikiFileManager(testDbDir);
});

afterEach(async () => {
  closeDatabase();
  if (existsSync(testDbDir)) {
    rmSync(testDbDir, { recursive: true, force: true });
  }
});

function getTestWikiManager(): WikiFileManager {
  return wikiManager;
}

async function createWikiPage(
  slug: string,
  title: string,
  type: "entity" | "concept" | "source" | "summary",
  content: string,
  tags: string[] = [],
  sourceIds: string[] = []
): Promise<string> {
  const now = Date.now();
  wikiManager.createPage({
    title,
    type,
    slug,
    content,
    tags,
    sourceIds,
    createdAt: now,
    updatedAt: now,
  });

  const page = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiManager.getPagePath(type, slug),
    tags,
    sourceIds,
  });

  return page.id;
}

async function createLink(fromPageId: string, toPageId: string, relationType: string = "reference"): Promise<void> {
  await storage.wikiLinks.create({
    fromPageId,
    toPageId,
    relationType,
  });
}

describe("Lint Processor", () => {
  describe("lintWiki", () => {
    it("should return empty report when no wiki pages exist", async () => {
      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.totalPages).toBe(0);
      expect(report.totalPagesWithIssues).toBe(0);
      expect(report.issues.length).toBe(0);
      expect(report.orphanPages.length).toBe(0);
      expect(report.stalePages.length).toBe(0);
      expect(report.missingReferences.length).toBe(0);
      expect(report.potentialConflicts.length).toBe(0);
      expect(report.suggestions).toContain("No wiki pages found. Start by ingesting raw resources.");
    });

    it("should create processing log entry for lint operation", async () => {
      await createWikiPage("test", "Test Page", "concept", "Test content.");

      await lintWiki({ wikiFileManager: getTestWikiManager() });

      const logs = await storage.processingLog.findByOperation("lint");
      expect(logs.length).toBe(1);
      expect(logs[0]?.details?.totalPages).toBe(1);
    });

    it("should append to wiki log file", async () => {
      await createWikiPage("test", "Test Page", "concept", "Test content.");

      await lintWiki({ wikiFileManager: getTestWikiManager() });

      const logEntries = getTestWikiManager().readLog();
      const lastEntry = logEntries[logEntries.length - 1];
      expect(lastEntry?.operation).toBe("lint");
      expect(lastEntry?.title).toBe("Wiki Health Check");
    });

    it("should detect healthy wiki with linked pages", async () => {
      const page1Id = await createWikiPage("react", "React", "concept", "React is a JavaScript library.");
      const page2Id = await createWikiPage("javascript", "JavaScript", "concept", "JavaScript is a programming language.");

      await createLink(page1Id, page2Id);
      await createLink(page2Id, page1Id);

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.totalPages).toBe(2);
      expect(report.orphanPages.length).toBe(0);
      expect(report.suggestions).toContain("Wiki is in good health. No issues detected.");
    });
  });

  describe("orphan detection", () => {
    it("should detect completely isolated pages as orphans", async () => {
      await createWikiPage("isolated", "Isolated Page", "concept", "This page has no links.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.orphanPages.length).toBe(1);
      expect(report.orphanPages[0]?.slug).toBe("isolated");
      expect(report.issues.some((i) => i.type === "orphan" && i.pageSlug === "isolated")).toBe(true);
    });

    it("should not detect pages with incoming links as orphans", async () => {
      const page1Id = await createWikiPage("main", "Main Page", "concept", "Main content.");
      const page2Id = await createWikiPage("linked", "Linked Page", "concept", "Linked content.");

      await createLink(page1Id, page2Id);

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.orphanPages.some((p) => p.slug === "linked")).toBe(false);
    });

    it("should not detect pages with outgoing links as orphans", async () => {
      const page1Id = await createWikiPage("linker", "Linker Page", "concept", "Linker content.");
      const page2Id = await createWikiPage("target", "Target Page", "concept", "Target content.");

      await createLink(page1Id, page2Id);

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.orphanPages.some((p) => p.slug === "linker")).toBe(false);
    });

    it("should suggest action for orphan pages", async () => {
      await createWikiPage("orphan", "Orphan Page", "entity", "No connections.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const orphanIssue = report.issues.find((i) => i.type === "orphan");
      expect(orphanIssue?.suggestedAction).toContain("Add cross-references");
      expect(report.suggestions.some((s) => s.includes("orphan pages"))).toBe(true);
    });

    it("should skip orphan check when disabled", async () => {
      await createWikiPage("isolated", "Isolated Page", "concept", "No links.");

      const report = await lintWiki({
        checkOrphans: false,
        wikiFileManager: getTestWikiManager(),
      });

      expect(report.orphanPages.length).toBe(0);
      expect(report.issues.some((i) => i.type === "orphan")).toBe(false);
    });
  });

  describe("stale page detection", () => {
    it("should not detect recently updated pages as stale", async () => {
      await createWikiPage("fresh-page", "Fresh Page", "concept", "Fresh content.");

      const report = await lintWiki({
        staleThresholdDays: 30,
        wikiFileManager: getTestWikiManager(),
      });

      expect(report.stalePages.length).toBe(0);
    });

    it("should skip stale check when disabled", async () => {
      await createWikiPage("page", "Page", "concept", "Content.");

      const report = await lintWiki({
        checkStale: false,
        wikiFileManager: getTestWikiManager(),
      });

      expect(report.stalePages.length).toBe(0);
      expect(report.issues.some((i) => i.type === "stale")).toBe(false);
    });
  });

  describe("missing reference detection", () => {
    it("should detect references to non-existent pages", async () => {
      await createWikiPage("referrer", "Referrer", "concept", "See [[non-existent]] for details.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.missingReferences.length).toBe(1);
      expect(report.missingReferences[0]?.referencedSlug).toBe("non-existent");
      expect(report.issues.some((i) => i.type === "missing_reference")).toBe(true);
    });

    it("should not flag valid wiki links", async () => {
      await createWikiPage("page1", "Page One", "concept", "Related to [[page2]].");
      await createWikiPage("page2", "Page Two", "concept", "Related to [[page1]].");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.missingReferences.length).toBe(0);
    });

    it("should detect multiple missing references", async () => {
      await createWikiPage(
        "multi-ref",
        "Multi Reference",
        "summary",
        "See [[missing1]], [[missing2]], and [[missing3]]."
      );

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.missingReferences.length).toBe(3);
      expect(report.missingReferences.map((r) => r.referencedSlug)).toContain("missing1");
      expect(report.missingReferences.map((r) => r.referencedSlug)).toContain("missing2");
      expect(report.missingReferences.map((r) => r.referencedSlug)).toContain("missing3");
    });

    it("should suggest creating missing pages", async () => {
      await createWikiPage("broken-link", "Broken Link", "concept", "Check [[missing-page]].");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const missingRefIssue = report.issues.find((i) => i.type === "missing_reference");
      expect(missingRefIssue?.suggestedAction).toContain("Create page");
      expect(report.suggestions.some((s) => s.includes("missing referenced pages"))).toBe(true);
    });

    it("should skip missing reference check when disabled", async () => {
      await createWikiPage("ref-page", "Ref Page", "concept", "See [[does-not-exist]].");

      const report = await lintWiki({
        checkMissingReferences: false,
        wikiFileManager: getTestWikiManager(),
      });

      expect(report.missingReferences.length).toBe(0);
      expect(report.issues.some((i) => i.type === "missing_reference")).toBe(false);
    });
  });

  describe("potential conflict detection", () => {
    it("should detect pages with duplicate titles", async () => {
      await createWikiPage("react-1", "React", "concept", "React library description.");
      await createWikiPage("react-2", "React", "entity", "React company information.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.potentialConflicts.length).toBe(1);
      expect(report.potentialConflicts[0]?.reason).toContain("Duplicate title");
    });

    it("should suggest reviewing conflicts", async () => {
      await createWikiPage("dup-1", "Duplicate Title", "concept", "First version.");
      await createWikiPage("dup-2", "Duplicate Title", "concept", "Second version.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const conflictIssue = report.issues.find((i) => i.type === "potential_conflict");
      expect(conflictIssue?.suggestedAction).toContain("Review both pages");
      expect(report.suggestions.some((s) => s.includes("content conflicts"))).toBe(true);
    });

    it("should skip conflict check when disabled", async () => {
      await createWikiPage("same-1", "Same Title", "concept", "Content 1.");
      await createWikiPage("same-2", "Same Title", "concept", "Content 2.");

      const report = await lintWiki({
        checkPotentialConflicts: false,
        wikiFileManager: getTestWikiManager(),
      });

      expect(report.potentialConflicts.length).toBe(0);
    });
  });

  describe("issue severity", () => {
    it("should mark missing references as high severity", async () => {
      await createWikiPage("referrer", "Referrer", "concept", "Link to [[missing]].");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const missingRefIssue = report.issues.find((i) => i.type === "missing_reference");
      expect(missingRefIssue?.severity).toBe("high");
    });

    it("should mark orphan pages as medium severity", async () => {
      await createWikiPage("isolated", "Isolated", "concept", "No links.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const orphanIssue = report.issues.find((i) => i.type === "orphan");
      expect(orphanIssue?.severity).toBe("medium");
    });

    it("should mark potential conflicts as medium severity", async () => {
      await createWikiPage("dup-1", "Same Title", "concept", "Content.");
      await createWikiPage("dup-2", "Same Title", "concept", "More content.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      const conflictIssue = report.issues.find((i) => i.type === "potential_conflict");
      expect(conflictIssue?.severity).toBe("medium");
    });
  });

  describe("findOrphanPages", () => {
    it("should return only completely isolated pages", async () => {
      await createWikiPage("isolated", "Isolated", "concept", "Isolated content.");

      const orphans = await findOrphanPages(getTestWikiManager());

      expect(orphans.length).toBe(1);
      expect(orphans[0]?.slug).toBe("isolated");
    });
  });

  describe("findMissingReferences", () => {
    it("should return only missing references", async () => {
      await createWikiPage("page1", "Page One", "concept", "See [[existing]] and [[missing]].");
      await createWikiPage("existing", "Existing", "concept", "Exists.");

      const missing = await findMissingReferences(getTestWikiManager());

      expect(missing.length).toBe(1);
      expect(missing[0]?.referencedSlug).toBe("missing");
      expect(missing[0]?.fromPage.slug).toBe("page1");
    });
  });

  describe("getLintHistory", () => {
    it("should return lint history from processing log", async () => {
      await createWikiPage("test1", "Test 1", "concept", "Content 1.");
      await lintWiki({ wikiFileManager: getTestWikiManager() });

      await createWikiPage("test2", "Test 2", "concept", "Content 2.");
      await lintWiki({ wikiFileManager: getTestWikiManager() });

      const history = await getLintHistory();

      expect(history.length).toBe(2);
      expect(history[0]?.totalPages).toBe(2);
      expect(history[1]?.totalPages).toBe(1);
    });

    it("should limit history results", async () => {
      await createWikiPage("test", "Test", "concept", "Content.");

      for (let i = 0; i < 15; i++) {
        await lintWiki({ wikiFileManager: getTestWikiManager() });
      }

      const history = await getLintHistory(5);
      expect(history.length).toBe(5);
    });

    it("should return empty history when no lint operations", async () => {
      const history = await getLintHistory();
      expect(history.length).toBe(0);
    });
  });

  describe("comprehensive lint report", () => {
    it("should generate report with orphan pages", async () => {
      await createWikiPage("orphan1", "Orphan 1", "concept", "Isolated 1.");
      await createWikiPage("orphan2", "Orphan 2", "concept", "Isolated 2.");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.totalPages).toBe(2);
      expect(report.orphanPages.length).toBe(2);
      expect(report.totalPagesWithIssues).toBe(2);
    });

    it("should not double-count pages with multiple issues", async () => {
      await createWikiPage("multi-issue", "Multi Issue", "concept", "Stale and orphan. [[missing]]");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.totalPagesWithIssues).toBe(1);
      expect(report.issues.filter((i) => i.pageSlug === "multi-issue").length).toBeGreaterThan(1);
    });

    it("should provide actionable suggestions", async () => {
      await createWikiPage("isolated", "Isolated", "concept", "No links here [[missing-ref]].");

      const report = await lintWiki({ wikiFileManager: getTestWikiManager() });

      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.suggestions.some((s) => s.includes("orphan") || s.includes("missing"))).toBe(true);
    });
  });
});
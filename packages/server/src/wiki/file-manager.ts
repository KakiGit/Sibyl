import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import grayMatter from "gray-matter";
import { WIKI_DIR, WIKI_PAGE_TYPES, DATA_DIR } from "@sibyl/shared";
import { logger } from "@sibyl/shared";
import type { WikiPageType } from "@sibyl/sdk";

export interface WikiPageContent {
  title: string;
  type: WikiPageType;
  slug: string;
  summary?: string;
  tags: string[];
  sourceIds: string[];
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface IndexEntry {
  slug: string;
  title: string;
  type: WikiPageType;
  summary?: string;
  path: string;
}

export interface LogEntry {
  timestamp: string;
  operation: "ingest" | "query" | "filing" | "lint";
  title: string;
  details?: string;
}

function cleanFrontmatter(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

const WIKI_PAGE_DIRS: Record<WikiPageType, string> = {
  entity: "entities",
  concept: "concepts",
  source: "sources",
  summary: "summaries",
};

export class WikiFileManager {
  private wikiDir: string;
  private indexPath: string;
  private logPath: string;

  constructor(baseDir?: string) {
    const base = baseDir || DATA_DIR;
    this.wikiDir = join(base, WIKI_DIR.replace(`${DATA_DIR}/`, ""));
    this.indexPath = join(this.wikiDir, "index.md");
    this.logPath = join(this.wikiDir, "log.md");
    this.ensureWikiStructure();
  }

  private ensureWikiStructure(): void {
    if (!existsSync(this.wikiDir)) {
      mkdirSync(this.wikiDir, { recursive: true });
    }

    for (const subdir of Object.values(WIKI_PAGE_DIRS)) {
      const dir = join(this.wikiDir, subdir);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    if (!existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, this.generateEmptyIndex());
    }

    if (!existsSync(this.logPath)) {
      writeFileSync(this.logPath, "# Processing Log\n\n");
    }
  }

  private generateEmptyIndex(): string {
    return `# Wiki Index

This file catalogs all wiki pages organized by category.

## Entities

(No entries yet)

## Concepts

(No entries yet)

## Sources

(No entries yet)

## Summaries

(No entries yet)
`;
  }

  getPagePath(type: WikiPageType, slug: string): string {
    const subdir = WIKI_PAGE_DIRS[type];
    return join(this.wikiDir, subdir, `${slug}.md`);
  }

  createPage(page: WikiPageContent): void {
    const path = this.getPagePath(page.type, page.slug);
    const dir = dirname(path);
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const frontmatter = cleanFrontmatter({
      title: page.title,
      type: page.type,
      slug: page.slug,
      summary: page.summary,
      tags: page.tags,
      sourceIds: page.sourceIds,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    });

    const fileContent = grayMatter.stringify(page.content, frontmatter);
    writeFileSync(path, fileContent);

    this.addToIndex({
      slug: page.slug,
      title: page.title,
      type: page.type,
      summary: page.summary,
      path: `${WIKI_PAGE_DIRS[page.type]}/${page.slug}.md`,
    });

    logger.debug("Created wiki page file", { path, slug: page.slug });
  }

  readPage(type: WikiPageType, slug: string): WikiPageContent | null {
    const path = this.getPagePath(type, slug);
    
    if (!existsSync(path)) {
      return null;
    }

    const fileContent = readFileSync(path, "utf-8");
    const { data, content } = grayMatter(fileContent);

    return {
      title: data.title,
      type: data.type,
      slug: data.slug,
      summary: data.summary,
      tags: data.tags || [],
      sourceIds: data.sourceIds || [],
      content: content.trim(),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  updatePage(page: WikiPageContent): void {
    const existing = this.readPage(page.type, page.slug);
    
    if (!existing) {
      this.createPage(page);
      return;
    }

    const path = this.getPagePath(page.type, page.slug);
    
    const frontmatter = cleanFrontmatter({
      title: page.title,
      type: page.type,
      slug: page.slug,
      summary: page.summary,
      tags: page.tags,
      sourceIds: page.sourceIds,
      createdAt: existing.createdAt,
      updatedAt: page.updatedAt,
    });

    const fileContent = grayMatter.stringify(page.content, frontmatter);
    writeFileSync(path, fileContent);

    this.updateInIndex({
      slug: page.slug,
      title: page.title,
      type: page.type,
      summary: page.summary,
      path: `${WIKI_PAGE_DIRS[page.type]}/${page.slug}.md`,
    });

    logger.debug("Updated wiki page file", { path, slug: page.slug });
  }

  deletePage(type: WikiPageType, slug: string): boolean {
    const path = this.getPagePath(type, slug);
    
    if (!existsSync(path)) {
      return false;
    }

    rmSync(path);
    this.removeFromIndex(slug, type);

    logger.debug("Deleted wiki page file", { path, slug });
    return true;
  }

  listPages(type?: WikiPageType): string[] {
    const slugs: string[] = [];

    const typesToScan = type ? [type] : [...WIKI_PAGE_TYPES];
    
    for (const t of typesToScan) {
      const dir = join(this.wikiDir, WIKI_PAGE_DIRS[t]);
      
      if (existsSync(dir)) {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(".md")) {
            slugs.push(file.replace(".md", ""));
          }
        }
      }
    }

    return slugs;
  }

  private addToIndex(entry: IndexEntry): void {
    const indexContent = readFileSync(this.indexPath, "utf-8");
    const sections = this.parseIndexSections(indexContent);

    const sectionKey = this.getSectionKey(entry.type);
    const section = sections[sectionKey] || [];

    const existingIndex = section.findIndex((e) => e.slug === entry.slug);
    if (existingIndex === -1) {
      section.push(entry);
      sections[sectionKey] = section;
    }

    writeFileSync(this.indexPath, this.generateIndexContent(sections));
  }

  private updateInIndex(entry: IndexEntry): void {
    const indexContent = readFileSync(this.indexPath, "utf-8");
    const sections = this.parseIndexSections(indexContent);

    const sectionKey = this.getSectionKey(entry.type);
    const section = sections[sectionKey] || [];

    const existingIndex = section.findIndex((e) => e.slug === entry.slug);
    if (existingIndex !== -1) {
      section[existingIndex] = entry;
    } else {
      section.push(entry);
    }
    sections[sectionKey] = section;

    writeFileSync(this.indexPath, this.generateIndexContent(sections));
  }

  private removeFromIndex(slug: string, type: WikiPageType): void {
    const indexContent = readFileSync(this.indexPath, "utf-8");
    const sections = this.parseIndexSections(indexContent);

    const sectionKey = this.getSectionKey(type);
    const section = sections[sectionKey] || [];

    sections[sectionKey] = section.filter((e) => e.slug !== slug);

    writeFileSync(this.indexPath, this.generateIndexContent(sections));
  }

  private getSectionKey(type: WikiPageType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private parseIndexSections(content: string): Record<string, IndexEntry[]> {
    const sections: Record<string, IndexEntry[]> = {};
    const lines = content.split("\n");
    let currentSection: string | null = null;

    for (const line of lines) {
      const sectionMatch = line.match(/^## (.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        sections[currentSection] = [];
        continue;
      }

      if (currentSection && line.startsWith("- ")) {
        const entryMatch = line.match(/^- \[([^\]]+)\]\(([^)]+)\)(?: - (.+))?$/);
        if (entryMatch) {
          const title = entryMatch[1];
          const path = entryMatch[2];
          const summary = entryMatch[3];
          
          const slug = path.replace(".md", "").split("/").pop() || "";
          const type = this.getTypeFromPath(path);

          sections[currentSection].push({
            slug,
            title,
            type,
            summary: summary?.trim(),
            path,
          });
        }
      }
    }

    return sections;
  }

  private getTypeFromPath(path: string): WikiPageType {
    for (const [type, dir] of Object.entries(WIKI_PAGE_DIRS)) {
      if (path.startsWith(dir)) {
        return type as WikiPageType;
      }
    }
    return "concept";
  }

  private generateIndexContent(sections: Record<string, IndexEntry[]>): string {
    const lines: string[] = ["# Wiki Index\n\nThis file catalogs all wiki pages organized by category.\n"];

    for (const [sectionName, entries] of Object.entries(sections)) {
      lines.push(`\n## ${sectionName}\n\n`);
      
      if (entries.length === 0) {
        lines.push("(No entries yet)\n");
      } else {
        for (const entry of entries) {
          const summaryPart = entry.summary ? ` - ${entry.summary}` : "";
          lines.push(`- [${entry.title}](${entry.path})${summaryPart}\n`);
        }
      }
    }

    return lines.join("");
  }

  appendToLog(entry: LogEntry): void {
    if (!existsSync(this.logPath)) {
      mkdirSync(dirname(this.logPath), { recursive: true });
      writeFileSync(this.logPath, "# Processing Log\n\n");
    }
    
    const timestamp = entry.timestamp || new Date().toISOString().split("T")[0];
    const logLine = `## [${timestamp}] ${entry.operation} | ${entry.title}\n${entry.details ? entry.details + "\n" : ""}\n`;
    
    appendFileSync(this.logPath, logLine);
    logger.debug("Appended to log", { operation: entry.operation, title: entry.title });
  }

  readLog(limit?: number): LogEntry[] {
    if (!existsSync(this.logPath)) {
      return [];
    }

    const content = readFileSync(this.logPath, "utf-8");
    const entries: LogEntry[] = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^## \[([^\]]+)\] (ingest|query|filing|lint) \| (.+)$/);
      
      if (match) {
        const timestamp = match[1];
        const operation = match[2] as LogEntry["operation"];
        const title = match[3];
        
        let details: string | undefined;
        let j = i + 1;
        while (j < lines.length && !lines[j].startsWith("## ")) {
          if (lines[j].trim()) {
            details = details ? details + "\n" + lines[j] : lines[j];
          }
          j++;
        }

        entries.push({ timestamp, operation, title, details });
      }
    }

    if (limit && entries.length > limit) {
      return entries.slice(-limit);
    }

    return entries;
  }

  getIndex(): IndexEntry[] {
    if (!existsSync(this.indexPath)) {
      return [];
    }

    const content = readFileSync(this.indexPath, "utf-8");
    const sections = this.parseIndexSections(content);
    
    const allEntries: IndexEntry[] = [];
    for (const entries of Object.values(sections)) {
      allEntries.push(...entries);
    }

    return allEntries;
  }

  rebuildIndex(): void {
    const entries: IndexEntry[] = [];

    for (const type of [...WIKI_PAGE_TYPES]) {
      const slugs = this.listPages(type);
      
      for (const slug of slugs) {
        const page = this.readPage(type, slug);
        if (page) {
          entries.push({
            slug: page.slug,
            title: page.title,
            type: page.type,
            summary: page.summary,
            path: `${WIKI_PAGE_DIRS[type]}/${page.slug}.md`,
          });
        }
      }
    }

    const sections: Record<string, IndexEntry[]> = {};
    for (const type of [...WIKI_PAGE_TYPES]) {
      sections[this.getSectionKey(type)] = entries.filter((e) => e.type === type);
    }

    writeFileSync(this.indexPath, this.generateIndexContent(sections));
    logger.info("Rebuilt wiki index", { totalEntries: entries.length });
  }

  getWikiDir(): string {
    return this.wikiDir;
  }

  getIndexPath(): string {
    return this.indexPath;
  }

  getLogPath(): string {
    return this.logPath;
  }
}

export const wikiFileManager = new WikiFileManager();
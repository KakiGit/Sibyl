import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, basename } from "path";
import grayMatter from "gray-matter";
import { wikiFileManager } from "../wiki/index.js";
import { storage } from "../storage/index.js";
import { logger } from "@sibyl/shared";
import type { WikiPageType } from "@sibyl/sdk";

const ImportMarkdownSchema = z.object({
  filePath: z.string().min(1).describe("Path to the markdown file to import"),
  type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Wiki page type (auto-detected from frontmatter if not provided)"),
  slug: z.string().optional().describe("Custom slug (auto-generated from filename if not provided)"),
});

const ImportDirectorySchema = z.object({
  directoryPath: z.string().min(1).describe("Path to directory containing markdown files"),
  type: z.enum(["entity", "concept", "source", "summary"]).optional().describe("Wiki page type for all files (auto-detected if not provided)"),
  recursive: z.boolean().optional().default(false).describe("Search subdirectories recursively"),
});

const WIKI_PAGE_TYPES: WikiPageType[] = ["entity", "concept", "source", "summary"];

function generateSlugFromFilename(filename: string): string {
  const baseName = basename(filename, ".md");
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function detectTypeFromFrontmatter(frontmatter: Record<string, unknown>): WikiPageType | null {
  if (frontmatter.type && WIKI_PAGE_TYPES.includes(frontmatter.type as WikiPageType)) {
    return frontmatter.type as WikiPageType;
  }
  return null;
}

function parseMarkdownFile(filePath: string): {
  frontmatter: Record<string, unknown>;
  content: string;
} {
  const fileContent = readFileSync(filePath, "utf-8");
  const { data, content } = grayMatter(fileContent);
  return { frontmatter: data, content: content.trim() };
}

async function importSingleMarkdown(
  filePath: string,
  options?: { type?: WikiPageType; slug?: string; updateExisting?: boolean }
): Promise<{
  wikiPageId: string;
  slug: string;
  title: string;
  type: WikiPageType;
  importedFrom: string;
  isNew: boolean;
}> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!filePath.endsWith(".md")) {
    throw new Error(`File must be a markdown file (.md): ${filePath}`);
  }

  const { frontmatter, content } = parseMarkdownFile(filePath);

  const type = options?.type || detectTypeFromFrontmatter(frontmatter) || "concept";
  const slug = options?.slug || (frontmatter.slug as string) || generateSlugFromFilename(filePath);
  const title = (frontmatter.title as string) || basename(filePath, ".md");
  const summary = frontmatter.summary as string | undefined;
  const tags = (frontmatter.tags as string[]) || [];
  const sourceIds = (frontmatter.sourceIds as string[]) || [];

  const now = Date.now();
  const updatedAt = now;

  const existingPage = await storage.wikiPages.findBySlug(slug);

  if (existingPage) {
    const createdAt = existingPage.createdAt;
    
    await storage.wikiPages.update(existingPage.id, {
      title,
      type,
      contentPath: wikiFileManager.getPagePath(type, slug),
      summary,
      tags,
      sourceIds,
      updatedAt,
    });

    wikiFileManager.updatePage({
      title,
      type,
      slug,
      summary,
      tags,
      sourceIds,
      content,
      createdAt,
      updatedAt,
    });

    logger.info("Updated existing wiki page from markdown import", {
      filePath,
      wikiPageId: existingPage.id,
      slug,
      type,
    });

    return {
      wikiPageId: existingPage.id,
      slug,
      title,
      type,
      importedFrom: filePath,
      isNew: false,
    };
  }

  const wikiPage = await storage.wikiPages.create({
    slug,
    title,
    type,
    contentPath: wikiFileManager.getPagePath(type, slug),
    summary,
    tags,
    sourceIds,
  });

  const createdAt = Date.now();

  wikiFileManager.createPage({
    title,
    type,
    slug,
    summary,
    tags,
    sourceIds,
    content,
    createdAt,
    updatedAt: createdAt,
  });

  logger.info("Imported markdown file as wiki page", {
    filePath,
    wikiPageId: wikiPage.id,
    slug,
    type,
  });

  return {
    wikiPageId: wikiPage.id,
    slug,
    title,
    type,
    importedFrom: filePath,
    isNew: true,
  };
}

async function importDirectory(
  directoryPath: string,
  options?: { type?: WikiPageType; recursive?: boolean }
): Promise<{
  imported: Array<{
    wikiPageId: string;
    slug: string;
    title: string;
    type: WikiPageType;
    importedFrom: string;
    isNew: boolean;
  }>;
  failed: Array<{
    filePath: string;
    error: string;
  }>;
  total: number;
}> {
  if (!existsSync(directoryPath)) {
    throw new Error(`Directory not found: ${directoryPath}`);
  }

  const imported: Array<{
    wikiPageId: string;
    slug: string;
    title: string;
    type: WikiPageType;
    importedFrom: string;
    isNew: boolean;
  }> = [];
  const failed: Array<{ filePath: string; error: string }> = [];

  const scanDirectory = (dir: string, recursive: boolean): string[] => {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...scanDirectory(fullPath, recursive));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }

    return files;
  };

  const files = scanDirectory(directoryPath, options?.recursive || false);

  for (const filePath of files) {
    try {
      const result = await importSingleMarkdown(filePath, { type: options?.type });
      imported.push(result);
    } catch (error) {
      failed.push({
        filePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      logger.warn("Failed to import markdown file", { filePath, error });
    }
  }

  logger.info("Batch markdown import completed", {
    imported: imported.length,
    failed: failed.length,
    total: files.length,
  });

  return { imported, failed, total: files.length };
}

export async function registerWikiImportRoutes(fastify: FastifyInstance) {
  fastify.post("/api/wiki-pages/import", async (request, reply) => {
    const body = ImportMarkdownSchema.safeParse(request.body);

    if (!body.success) {
      reply.code(400);
      return { error: body.error.message };
    }

    try {
      const result = await importSingleMarkdown(body.data.filePath, {
        type: body.data.type,
        slug: body.data.slug,
      });

      return { data: result };
    } catch (error) {
      reply.code(500);
      return {
        error: error instanceof Error ? error.message : "Import failed",
      };
    }
  });

  fastify.post("/api/wiki-pages/import-directory", async (request, reply) => {
    const body = ImportDirectorySchema.safeParse(request.body);

    if (!body.success) {
      reply.code(400);
      return { error: body.error.message };
    }

    try {
      const result = await importDirectory(body.data.directoryPath, {
        type: body.data.type,
        recursive: body.data.recursive,
      });

      return { data: result };
    } catch (error) {
      reply.code(500);
      return {
        error: error instanceof Error ? error.message : "Directory import failed",
      };
    }
  });
}
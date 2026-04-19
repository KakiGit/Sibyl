import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { storage } from "../storage/index.js";
import { ingestDocument } from "../ingestion/index.js";
import { wikiFileManager } from "../wiki/index.js";
import { ingestRawResource } from "../processors/ingest.js";
import { WikiPageTypeSchema } from "@sibyl/sdk";
import { logger } from "@sibyl/shared";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { DATA_DIR } from "@sibyl/shared";

const IngestPdfSchema = z.object({
  filePath: z.string().min(1),
  title: z.string().optional(),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

const IngestWebpageSchema = z.object({
  url: z.string().url(),
  html: z.string().optional(),
  title: z.string().optional(),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

const IngestImageSchema = z.object({
  filePath: z.string().min(1),
  createThumbnail: z.boolean().optional(),
  title: z.string().optional(),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

const UploadDocumentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
  mimeType: z.string().optional(),
  title: z.string().optional(),
  type: WikiPageTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export async function registerDocumentRoutes(fastify: FastifyInstance) {
  fastify.post("/api/documents/pdf", async (request, reply) => {
    const parseResult = IngestPdfSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    if (!existsSync(body.filePath)) {
      reply.code(400);
      return { error: "File does not exist", filePath: body.filePath };
    }

    try {
      const docResult = await ingestDocument({
        type: "pdf",
        filePath: body.filePath,
      });

      if (!docResult.success) {
        reply.code(500);
        return { error: docResult.error || "Failed to ingest PDF" };
      }

      const slug = body.title
        ? body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : body.filePath.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "pdf-document";

      const documentsDir = join(DATA_DIR, "raw", "documents");
      if (!existsSync(documentsDir)) {
        mkdirSync(documentsDir, { recursive: true });
      }

      const contentPath = join(documentsDir, `${slug}.md`);
      writeFileSync(contentPath, docResult.markdown);

      const rawResource = await storage.rawResources.create({
        type: "pdf",
        filename: body.filePath.split("/").pop() || slug,
        contentPath,
        metadata: {
          title: body.title,
          tags: body.tags,
          pdfMetadata: docResult.metadata,
          originalPath: body.filePath,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: body.title || (docResult.metadata as { title?: string }).title || slug,
        type: body.type || "source",
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("PDF ingested via API", {
        filePath: body.filePath,
        wikiPageId: ingestResult.wikiPageId,
        pageCount: (docResult.metadata as { pageCount?: number }).pageCount,
      });

      return {
        data: {
          rawResourceId: rawResource.id,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
          pdfMetadata: docResult.metadata,
        },
      };
    } catch (error) {
      logger.error("PDF ingestion failed", {
        filePath: body.filePath,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest PDF", message: (error as Error).message };
    }
  });

  fastify.post("/api/documents/webpage", async (request, reply) => {
    const parseResult = IngestWebpageSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    try {
      const docResult = await ingestDocument({
        type: "webpage",
        url: body.url,
        html: body.html,
      });

      if (!docResult.success) {
        reply.code(500);
        return { error: docResult.error || "Failed to ingest webpage" };
      }

      const slug = body.title
        ? body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : body.url.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "webpage";

      const webpagesDir = join(DATA_DIR, "raw", "webpages");
      if (!existsSync(webpagesDir)) {
        mkdirSync(webpagesDir, { recursive: true });
      }

      const contentPath = join(webpagesDir, `${slug}.md`);
      writeFileSync(contentPath, docResult.markdown);

      const rawResource = await storage.rawResources.create({
        type: "webpage",
        filename: slug,
        contentPath,
        sourceUrl: body.url,
        metadata: {
          title: body.title || docResult.metadata.title,
          tags: body.tags,
          webpageMetadata: docResult.metadata,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: body.title || (docResult.metadata as { title?: string }).title || slug,
        type: body.type || "source",
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("Webpage ingested via API", {
        url: body.url,
        wikiPageId: ingestResult.wikiPageId,
        imageCount: (docResult.metadata as { images?: string[] }).images?.length || 0,
      });

      return {
        data: {
          rawResourceId: rawResource.id,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
          webpageMetadata: docResult.metadata,
        },
      };
    } catch (error) {
      logger.error("Webpage ingestion failed", {
        url: body.url,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest webpage", message: (error as Error).message };
    }
  });

  fastify.post("/api/documents/image", async (request, reply) => {
    const parseResult = IngestImageSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;

    if (!existsSync(body.filePath)) {
      reply.code(400);
      return { error: "File does not exist", filePath: body.filePath };
    }

    try {
      const thumbnailsDir = join(DATA_DIR, "raw", "thumbnails");
      if (body.createThumbnail && !existsSync(thumbnailsDir)) {
        mkdirSync(thumbnailsDir, { recursive: true });
      }

      const docResult = await ingestDocument({
        type: "image",
        filePath: body.filePath,
        createThumbnail: body.createThumbnail,
        thumbnailDir: body.createThumbnail ? thumbnailsDir : undefined,
      });

      if (!docResult.success) {
        reply.code(500);
        return { error: docResult.error || "Failed to ingest image" };
      }

      const slug = body.title
        ? body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : body.filePath.split("/").pop()?.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") || "image";

      const documentsDir = join(DATA_DIR, "raw", "documents");
      if (!existsSync(documentsDir)) {
        mkdirSync(documentsDir, { recursive: true });
      }

      const contentPath = join(documentsDir, `${slug}.md`);
      writeFileSync(contentPath, docResult.markdown);

      const rawResource = await storage.rawResources.create({
        type: "image",
        filename: body.filePath.split("/").pop() || slug,
        contentPath,
        metadata: {
          title: body.title,
          tags: body.tags,
          imageMetadata: docResult.metadata,
          originalPath: body.filePath,
          thumbnailPath: docResult.thumbnailPath,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: body.title || slug,
        type: body.type || "source",
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("Image ingested via API", {
        filePath: body.filePath,
        wikiPageId: ingestResult.wikiPageId,
        dimensions: `${(docResult.metadata as { width?: number }).width}x${(docResult.metadata as { height?: number }).height}`,
        hasThumbnail: !!docResult.thumbnailPath,
      });

      return {
        data: {
          rawResourceId: rawResource.id,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
          imageMetadata: docResult.metadata,
          thumbnailPath: docResult.thumbnailPath,
        },
      };
    } catch (error) {
      logger.error("Image ingestion failed", {
        filePath: body.filePath,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest image", message: (error as Error).message };
    }
  });

  fastify.post("/api/documents/upload", async (request, reply) => {
    const parseResult = UploadDocumentSchema.safeParse(request.body);

    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }

    const body = parseResult.data;
    const mimeType = body.mimeType || "application/octet-stream";

    let docType: "pdf" | "image" | undefined;
    if (mimeType === "application/pdf" || body.filename.endsWith(".pdf")) {
      docType = "pdf";
    } else if (mimeType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(body.filename)) {
      docType = "image";
    }

    if (!docType) {
      reply.code(400);
      return { error: "Unsupported file type. Only PDF and images are supported." };
    }

    const tempDirPath = join(tmpdir(), "sibyl-upload");
    if (!existsSync(tempDirPath)) {
      mkdirSync(tempDirPath, { recursive: true });
    }

    const tempPath = join(tempDirPath, body.filename);
    const fileBuffer = Buffer.from(body.content, "base64");
    writeFileSync(tempPath, fileBuffer);

    try {
      const docResult = await ingestDocument({
        type: docType,
        filePath: tempPath,
        createThumbnail: docType === "image",
        thumbnailDir: join(DATA_DIR, "raw", "thumbnails"),
      });

      if (!docResult.success) {
        reply.code(500);
        return { error: docResult.error || `Failed to ingest ${docType}` };
      }

      const slug = body.filename
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const documentsDir = join(DATA_DIR, "raw", "documents");
      if (!existsSync(documentsDir)) {
        mkdirSync(documentsDir, { recursive: true });
      }

      const contentPath = join(documentsDir, `${slug}.md`);
      writeFileSync(contentPath, docResult.markdown);

      const rawResource = await storage.rawResources.create({
        type: docType,
        filename: body.filename,
        contentPath,
        metadata: {
          mimeType,
          ...docResult.metadata,
          thumbnailPath: docResult.thumbnailPath,
        },
      });

      const ingestResult = await ingestRawResource({
        rawResourceId: rawResource.id,
        title: body.title || slug,
        type: body.type || "source",
        tags: body.tags,
        wikiFileManager,
      });

      logger.info("Document uploaded and ingested", {
        filename: body.filename,
        type: docType,
        wikiPageId: ingestResult.wikiPageId,
      });

      return {
        data: {
          rawResourceId: rawResource.id,
          wikiPageId: ingestResult.wikiPageId,
          slug: ingestResult.slug,
          title: ingestResult.title,
          type: ingestResult.type,
          processed: ingestResult.processed,
          metadata: docResult.metadata,
          thumbnailPath: docResult.thumbnailPath,
        },
      };
    } catch (error) {
      logger.error("Document upload ingestion failed", {
        filename: body.filename,
        error: (error as Error).message,
      });
      reply.code(500);
      return { error: "Failed to ingest uploaded document", message: (error as Error).message };
    }
  });
}
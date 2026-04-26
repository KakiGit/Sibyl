import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { RAW_RESOURCE_TYPES, WIKI_PAGE_TYPES, OPERATIONS } from "@sibyl/shared";

export const rawResources = sqliteTable("raw_resources", {
  id: text().primaryKey(),
  type: text({ enum: RAW_RESOURCE_TYPES }).notNull(),
  filename: text().unique().notNull(),
  sourceUrl: text("source_url"),
  contentPath: text("content_path").notNull(),
  metadata: text(),
  createdAt: integer("created_at").notNull(),
  processed: integer().default(0),
});

export const wikiPages = sqliteTable("wiki_pages", {
  id: text().primaryKey(),
  slug: text().unique().notNull(),
  title: text().notNull(),
  type: text({ enum: WIKI_PAGE_TYPES }).notNull(),
  contentPath: text("content_path").notNull(),
  summary: text(),
  tags: text(),
  sourceIds: text("source_ids"),
  embeddingId: text("embedding_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  version: integer().default(1),
});

export const wikiLinks = sqliteTable("wiki_links", {
  id: text().primaryKey(),
  fromPageId: text("from_page_id")
    .notNull()
    .references(() => wikiPages.id),
  toPageId: text("to_page_id")
    .notNull()
    .references(() => wikiPages.id),
  relationType: text("relation_type").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const processingLog = sqliteTable("processing_log", {
  id: text().primaryKey(),
  operation: text({ enum: OPERATIONS }).notNull(),
  rawResourceId: text("raw_resource_id"),
  wikiPageId: text("wiki_page_id"),
  details: text(),
  createdAt: integer("created_at").notNull(),
});

export const embeddingsCache = sqliteTable("embeddings_cache", {
  id: text().primaryKey(),
  contentHash: text("content_hash").unique().notNull(),
  embedding: text().notNull(),
  model: text().notNull(),
  createdAt: integer("created_at").notNull(),
});

export const wikiPageVersions = sqliteTable("wiki_page_versions", {
  id: text().primaryKey(),
  wikiPageId: text("wiki_page_id")
    .notNull()
    .references(() => wikiPages.id),
  version: integer().notNull(),
  title: text().notNull(),
  summary: text(),
  tags: text(),
  contentSnapshot: text("content_snapshot").notNull(),
  changedBy: text("changed_by"),
  changeReason: text("change_reason"),
  createdAt: integer("created_at").notNull(),
});

export const synthesisCache = sqliteTable("synthesis_cache", {
  id: text().primaryKey(),
  queryHash: text("query_hash").unique().notNull(),
  query: text().notNull(),
  answer: text().notNull(),
  citations: text().notNull(),
  model: text(),
  pageIds: text("page_ids"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
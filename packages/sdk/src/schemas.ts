import { z } from "zod";
import { RAW_RESOURCE_TYPES, WIKI_PAGE_TYPES, OPERATIONS } from "@sibyl/shared";

export const RawResourceTypeSchema = z.enum(RAW_RESOURCE_TYPES);
export const WikiPageTypeSchema = z.enum(WIKI_PAGE_TYPES);
export const OperationSchema = z.enum(OPERATIONS);

export const RawResourceSchema = z.object({
  id: z.string(),
  type: RawResourceTypeSchema,
  filename: z.string(),
  sourceUrl: z.string().optional(),
  contentPath: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
  processed: z.boolean().default(false),
});

export const WikiPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  type: WikiPageTypeSchema,
  contentPath: z.string(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceIds: z.array(z.string()).default([]),
  embeddingId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  version: z.number().default(1),
});

export const WikiLinkSchema = z.object({
  id: z.string(),
  fromPageId: z.string(),
  toPageId: z.string(),
  relationType: z.string(),
  createdAt: z.number(),
});

export const ProcessingLogSchema = z.object({
  id: z.string(),
  operation: OperationSchema,
  rawResourceId: z.string().optional(),
  wikiPageId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number(),
});

export const EmbeddingCacheSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  embedding: z.array(z.number()),
  model: z.string(),
  createdAt: z.number(),
});

export const WikiPageVersionSchema = z.object({
  id: z.string(),
  wikiPageId: z.string(),
  version: z.number(),
  title: z.string(),
  summary: z.string().optional(),
  tags: z.array(z.string()).default([]),
  contentSnapshot: z.string(),
  changedBy: z.string().optional(),
  changeReason: z.string().optional(),
  createdAt: z.number(),
});

export type RawResourceType = z.infer<typeof RawResourceTypeSchema>;
export type WikiPageType = z.infer<typeof WikiPageTypeSchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type RawResource = z.infer<typeof RawResourceSchema>;
export type WikiPage = z.infer<typeof WikiPageSchema>;
export type WikiLink = z.infer<typeof WikiLinkSchema>;
export type ProcessingLog = z.infer<typeof ProcessingLogSchema>;
export type EmbeddingCache = z.infer<typeof EmbeddingCacheSchema>;
export type WikiPageVersion = z.infer<typeof WikiPageVersionSchema>;
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { SCHEMA_FILE, SCHEMA_DIR } from "@sibyl/shared";
import { logger } from "@sibyl/shared";

const DEFAULT_SCHEMA_CONTENT = `# Sibyl Schema

This document defines the wiki structure, conventions, and LLM processing workflows for the Sibyl knowledge base.

## Wiki Structure

The wiki is organized into four types of pages:

- **entities/**: Pages for people, places, organizations, things
- **concepts/**: Pages for ideas, topics, technical concepts
- **sources/**: Pages summarizing raw resources (documents, articles)
- **summaries/**: Pages synthesizing information from multiple sources

### Page Format

Each wiki page follows this structure:

\`\`\`
---
title: Page Title
type: entity | concept | source | summary
slug: page-slug
tags: [tag1, tag2, tag3]
sourceIds: [id1, id2]
createdAt: timestamp
updatedAt: timestamp
---

# Page Title

Content in markdown format...

## Cross-references

- Related to [[other-page-slug]]
- See also [[another-page]]
\`\`\`

## Operations

### Ingest Workflow

When a new raw resource is added:

1. Read the source content
2. Extract key information and entities
3. Create or update relevant wiki pages
4. Add cross-references to existing pages
5. Update the index.md
6. Append entry to log.md

### Query Workflow

When answering a question:

1. Search index.md for relevant pages
2. Read matching wiki pages
3. Synthesize an answer with citations
4. Use [[slug]] format for cross-references

### Filing Workflow

When saving a query result:

1. Analyze the answer for valuable synthesis
2. Create a new summary page
3. Link to source pages
4. Update index.md

### Lint Workflow

Periodic health check:

1. Find orphan pages (no incoming links)
2. Detect contradictions between pages
3. Identify missing cross-references
4. Suggest new pages for mentioned concepts
5. Recommend sources to investigate

## Conventions

### Cross-references

Use [[slug]] format to link between wiki pages.

### Tags

Tags should be lowercase, single words or short phrases.

### Summaries

Each page should have a concise summary (1-3 sentences).

## Notes

- Raw resources in data/raw/ are immutable
- Wiki pages can be updated and versioned
`;

function getSchemaPath(): string {
  return resolve(SCHEMA_FILE);
}

async function ensureSchemaDir(): Promise<void> {
  const schemaDir = resolve(SCHEMA_DIR);
  if (!existsSync(schemaDir)) {
    await mkdir(schemaDir, { recursive: true });
    logger.info("Created schema directory", { path: schemaDir });
  }
}

async function getSchemaContent(): Promise<string> {
  const schemaPath = getSchemaPath();
  
  if (!existsSync(schemaPath)) {
    await ensureSchemaDir();
    await writeFile(schemaPath, DEFAULT_SCHEMA_CONTENT, "utf-8");
    logger.info("Created default schema file", { path: schemaPath });
    return DEFAULT_SCHEMA_CONTENT;
  }
  
  const content = await readFile(schemaPath, "utf-8");
  return content;
}

const UpdateSchemaSchema = z.object({
  content: z.string().min(1),
});

export async function registerSchemaRoutes(fastify: FastifyInstance) {
  fastify.get("/api/schema", async () => {
    const content = await getSchemaContent();
    return {
      data: {
        content,
        path: SCHEMA_FILE,
        exists: existsSync(getSchemaPath()),
      },
    };
  });

  fastify.put("/api/schema", async (request, reply) => {
    const parseResult = UpdateSchemaSchema.safeParse(request.body);
    
    if (!parseResult.success) {
      reply.code(400);
      return { error: parseResult.error.message };
    }
    
    await ensureSchemaDir();
    const schemaPath = getSchemaPath();
    await writeFile(schemaPath, parseResult.data.content, "utf-8");
    
    logger.info("Updated schema file", { path: schemaPath });
    
    return {
      data: {
        content: parseResult.data.content,
        path: SCHEMA_FILE,
        updatedAt: Date.now(),
      },
    };
  });

  fastify.post("/api/schema/reset", async () => {
    await ensureSchemaDir();
    const schemaPath = getSchemaPath();
    await writeFile(schemaPath, DEFAULT_SCHEMA_CONTENT, "utf-8");
    
    logger.info("Reset schema to default", { path: schemaPath });
    
    return {
      data: {
        content: DEFAULT_SCHEMA_CONTENT,
        path: SCHEMA_FILE,
        updatedAt: Date.now(),
      },
    };
  });
}
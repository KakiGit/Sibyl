# Sibyl

A memory system for knowledge management, designed to be used by coding harnesses like Cursor, Copilot, Claude Code, and OpenCode.

## Overview

Sibyl maintains a memory database that can be used by coding harnesses to provide context-aware assistance. It consists of:

- **Sibyl Server**: Fastify-based HTTP server with MCP protocol support
- **Sibyl Web UI**: React-based web interface for managing memories
- **Sibyl Client**: CLI for managing, searching, and manipulating memories
- **Sibyl Plugin**: OpenCode plugin for harness integration

## Architecture

Sibyl uses a three-layer knowledge architecture:

1. **Raw Resources**: Immutable source documents (PDFs, images, webpages, text)
2. **Wiki Pages**: LLM-generated markdown files with structured knowledge
3. **Schema**: Configuration defining wiki structure and LLM processing rules

### Operations

- **Ingest**: Process raw resources into wiki pages
- **Query**: Search wiki pages and synthesize answers
- **Filing**: Save query results as new wiki pages
- **Lint**: Health check wiki pages for conflicts, orphans, and gaps

### Wiki Graph View

The Web UI includes a Wiki Graph View that visualizes relationships between wiki pages:

- Displays statistics: total pages, links, orphans, and hubs
- Identifies **hub pages** (pages with 3+ connections)
- Identifies **orphan pages** (pages with no connections)
- Shows incoming and outgoing link counts for each page

### Wiki Navigation API

The server provides endpoints for accessing wiki index and log files:

```bash
# Get wiki index entries (catalog of all pages)
curl http://localhost:3000/api/wiki-index

# Get processing log entries
curl http://localhost:3000/api/wiki-log

# Filter log by operation type
curl http://localhost:3000/api/wiki-log?operation=ingest

# Limit log entries
curl http://localhost:3000/api/wiki-log?limit=10

# Rebuild wiki index from existing pages
curl -X POST http://localhost:3000/api/wiki-index/rebuild
```

### Schema API

The schema defines wiki structure and LLM processing rules:

```bash
# Get current schema
curl http://localhost:3000/api/schema

# Update schema content
curl -X PUT http://localhost:3000/api/schema \
  -H "Content-Type: application/json" \
  -d '{"content": "# Custom Schema\n\nYour processing rules..."}'

# Reset schema to default
curl -X POST http://localhost:3000/api/schema/reset
```

The default schema includes:
- Wiki page structure and format conventions
- Ingest, Query, Filing, and Lint workflow definitions
- Cross-reference and tag conventions

## Build

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Typecheck all packages
bun run typecheck
```

## Start the Server

```bash
# Start the HTTP server (default port 3000)
bun run --filter @sibyl/server dev

# Or with custom port/host
PORT=8080 HOST=0.0.0.0 bun run --filter @sibyl/server dev
```

### Document Ingestion API

The server provides endpoints for ingesting various document types:

#### Ingest PDF

```bash
curl -X POST http://localhost:3000/api/documents/pdf \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/document.pdf", "title": "My Document"}'
```

#### Ingest Webpage

```bash
curl -X POST http://localhost:3000/api/documents/webpage \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/article", "title": "Article Title"}'
```

#### Ingest Image

```bash
curl -X POST http://localhost:3000/api/documents/image \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/photo.jpg", "createThumbnail": true}'
```

#### Upload Document (Base64)

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "document.pdf", "content": "<base64-encoded-content>", "mimeType": "application/pdf"}'
```

### Query Synthesis API

The server provides endpoints for querying and synthesizing answers from wiki pages:

#### Synthesize Answer

```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?"}'
```

Parameters:
- `query`: The question to answer (required)
- `types`: Filter by page types (`["entity", "concept", "source", "summary"]`)
- `tags`: Filter by tags
- `maxPages`: Maximum pages to use for synthesis (1-10, default: 5)
- `skipLlm`: Skip LLM and return basic summary (boolean, default: false)

#### Streaming Synthesis

```bash
curl -X POST http://localhost:3000/api/synthesize/stream \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?"}'
```

Returns Server-Sent Events with `start`, `answer`, `citations`, and `done` events.

### Hybrid Search API

The server provides FTS5-powered hybrid search combining keyword and semantic search:

```bash
# Basic search (keyword + semantic by default)
curl -X POST http://localhost:3000/api/wiki-pages/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning"}'

# Keyword-only search
curl -X POST http://localhost:3000/api/wiki-pages/search \
  -H "Content-Type: application/json" \
  -d '{"query": "neural networks", "useSemantic": false}'

# Filter by type
curl -X POST http://localhost:3000/api/wiki-pages/search \
  -H "Content-Type: application/json" \
  -d '{"query": "python", "type": "concept"}'

# Filter by tags
curl -X POST http://localhost:3000/api/wiki-pages/search \
  -H "Content-Type: application/json" \
  -d '{"query": "programming", "tags": "frontend,web"}'

# Adjust semantic threshold (0-1)
curl -X POST http://localhost:3000/api/wiki-pages/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ai", "semanticThreshold": 0.5, "limit": 20}'
```

Parameters:
- `query`: Search query (required)
- `type`: Filter by page type (`entity`, `concept`, `source`, `summary`)
- `tags`: Comma-separated tags filter
- `useSemantic`: Enable semantic search (default: true)
- `semanticThreshold`: Minimum similarity score (0-1, default: 0.3)
- `limit`: Maximum results (default: 10, max: 50)

Response format:
```json
{
  "data": [
    {
      "page": { "id": "...", "title": "...", "type": "..." },
      "keywordScore": 0.8,
      "semanticScore": 0.7,
      "combinedScore": 0.74,
      "matchType": "hybrid"
    }
  ]
}
```

#### Rebuild Search Index

```bash
curl -X POST http://localhost:3000/api/wiki-pages/search/rebuild-index
```

Rebuilds the FTS5 full-text search index from all existing wiki pages.

### Wiki Search UI

The Web UI includes a Wiki Search component that allows users to search wiki pages with:

- Hybrid search combining keyword (FTS5) and semantic (vector) search
- Type filtering (entity, concept, source, summary)
- Tag filtering
- Custom result limit
- Relevance score visualization
- Match type indicators (keyword, semantic, hybrid)

## Start the Web UI

```bash
# Start the Web UI (default port 5173, proxies to server on port 3000)
bun run --filter @sibyl/web dev

# Build for production
bun run --filter @sibyl/web build

# Preview production build
bun run --filter @sibyl/web preview
```

## Use the Client

```bash
# List wiki pages
bun run --filter @sibyl/client list

# Ingest content
bun run --filter @sibyl/client ingest --type text --file content.txt

# Query the wiki
bun run --filter @sibyl/client query "search query"

# File a query result
bun run --filter @sibyl/client file --page <page-id>

# Run lint check
bun run --filter @sibyl/client lint

# View graph
bun run --filter @sibyl/client graph
```

## Use the Plugin

The Sibyl plugin integrates with OpenCode to provide memory tools:

```typescript
// In your opencode configuration
import { SibylPlugin } from "@sibyl/plugin";

export default {
  plugin: [
    ["@sibyl/plugin", { serverUrl: "http://localhost:3000" }],
  ],
};
```

### Plugin Tools

- `memory_recall`: Search and retrieve memories
- `memory_save`: Save new information to the wiki
- `memory_list`: List all wiki pages
- `memory_delete`: Delete a wiki page
- `memory_ingest`: Ingest text content
- `memory_query`: Query the knowledge base
- `memory_log`: Get processing log entries

### Auto-Inject Context

The plugin can automatically inject memory context into the system prompt:

```typescript
["@sibyl/plugin", { serverUrl: "http://localhost:3000", autoInject: true }]
```

## MCP Server

Sibyl also provides an MCP server for stdio-based communication:

```bash
# Start MCP server (for integration with MCP clients)
bun run --filter @sibyl/server mcp
```

### MCP Tools

The MCP server provides the following tools for MCP clients (like Claude Code, Cursor, OpenCode):

- `memory_recall`: Search and retrieve memories from the wiki
- `memory_save`: Save new information to the wiki
- `memory_list`: List all wiki pages
- `memory_delete`: Delete a wiki page
- `memory_ingest`: Ingest text content directly and create wiki pages immediately
- `memory_raw_save`: Save raw content for later processing
- `memory_query`: Query the knowledge base with a question and return relevant pages
- `memory_log`: Get processing log entries

## Testing

```bash
# Run all tests
bun run test

# Run specific package tests
bun run --filter @sibyl/server test
bun run --filter @sibyl/plugin test
```

## LLM Configuration

Sibyl supports LLM-enhanced ingestion for generating structured wiki content with cross-references. Configure LLM by creating a `~/.llm_secrets` file:

```
base_url=https://api.openai.com/v1
api_key=your-api-key-here
model=gpt-4
```

Or use environment variables:
- `LLM_BASE_URL`: API endpoint URL
- `LLM_API_KEY`: API authentication key
- `LLM_MODEL`: Model name to use

When LLM is configured, the Web UI shows a "Use LLM enhancement" checkbox for ingestion. This generates:
- Structured wiki content with proper headings
- Summary and tags extracted from content
- Cross-references to existing wiki pages

### LLM-Enhanced Lint

Sibyl provides an LLM-enhanced lint endpoint for deeper wiki analysis:

```bash
# Run LLM-enhanced lint (requires LLM configuration)
curl -X POST http://localhost:3000/api/lint/llm

# Or with GET method
curl http://localhost:3000/api/lint/llm

# Skip LLM and get basic suggestions
curl http://localhost:3000/api/lint/llm?skipLlm=true

# Limit pages to analyze
curl http://localhost:3000/api/lint/llm?maxPagesToAnalyze=5
```

When LLM is configured, the enhanced lint analyzes wiki content for:
- Content contradictions between pages
- Important concepts mentioned but lacking their own page
- Improvement suggestions for existing pages
- New sources or topics to investigate

## Project Structure

```
sibyl/
├── packages/
│   ├── server/      # HTTP server + MCP
│   ├── web/         # React Web UI
│   ├── client/      # CLI
│   ├── plugin/      # OpenCode plugin
│   ├── sdk/         # Shared types/schemas
│   └── shared/      # Utilities
├── data/
│   ├── raw/         # Raw resources
│   ├── wiki/        # Wiki pages
│   ├── schema/      # Schema configuration
│   └── db/          # SQLite database
└── package.json
```

## Technology Stack

- **Runtime**: Bun 1.3.x
- **Language**: TypeScript 5.8.x
- **Server**: Fastify 5.x + Zod 4.x
- **Database**: SQLite + Drizzle ORM
- **LLM**: Vercel AI SDK (Anthropic, OpenAI, Google)
- **Embeddings**: @xenova/transformers (local)
- **Frontend**: React 19 + shadcn/ui + TanStack Query/Router
- **CLI**: @clack/prompts + yargs
- **MCP**: @modelcontextprotocol/sdk

## License

MIT
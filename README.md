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

### Raw Resource Index API

The server maintains a file-based index of raw resources at `data/raw/index.json`:

```bash
# Get raw resource index (file-based catalog of all raw resources)
curl http://localhost:3000/api/raw-index

# Get raw resource index statistics
curl http://localhost:3000/api/raw-index/stats

# Get unprocessed raw resources
curl http://localhost:3000/api/raw-index/unprocessed

# Get resources by type
curl http://localhost:3000/api/raw-index/pdf
curl http://localhost:3000/api/raw-index/webpage

# Rebuild raw resource index from database
curl -X POST http://localhost:3000/api/raw-index/rebuild
```

The raw resource index provides:
- File-based metadata backup for raw resources
- Quick offline browsing without database queries
- Statistics by resource type (pdf, image, webpage, text)
- Processing status tracking

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

### Wiki Page Version History API

The server provides endpoints for viewing and managing wiki page version history:

```bash
# Get version history for a wiki page
curl http://localhost:3000/api/wiki-pages/<page-id>/versions

# Get specific version details
curl http://localhost:3000/api/wiki-pages/<page-id>/versions/1

# Restore wiki page to a previous version
curl -X POST http://localhost:3000/api/wiki-pages/<page-id>/restore/1 \
  -H "Content-Type: application/json" \
  -d '{"changedBy": "user", "changeReason": "Reverting to previous version"}'

# Compare two versions (diff)
curl http://localhost:3000/api/wiki-pages/<page-id>/versions/diff/1/2
```

Version history features:
- Automatic version tracking on every wiki page update
- Content snapshots stored for each version
- Change metadata (changedBy, changeReason)
- Restore functionality to revert to previous versions
- Diff comparison between versions

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

### Wiki Import API

The server provides endpoints for importing existing markdown files as wiki pages:

#### Import Single Markdown File

```bash
curl -X POST http://localhost:3000/api/wiki-pages/import \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/path/to/document.md"}'
```

Parameters:
- `filePath`: Path to the markdown file (required)
- `type`: Wiki page type (`entity`, `concept`, `source`, `summary`, auto-detected from frontmatter if not provided)
- `slug`: Custom slug (auto-generated from filename if not provided)

The markdown file can contain YAML frontmatter with metadata:
- `title`: Page title
- `type`: Page type
- `summary`: Brief summary
- `tags`: Array of tags
- `slug`: Custom slug

Example markdown file:
```markdown
---
title: Machine Learning Overview
type: concept
tags: [ai, ml, tutorial]
summary: Introduction to machine learning concepts
---

# Machine Learning Overview

Content with [[wiki-links]] to other pages.
```

#### Import Directory of Markdown Files

```bash
# Import all markdown files from a directory
curl -X POST http://localhost:3000/api/wiki-pages/import-directory \
  -H "Content-Type: application/json" \
  -d '{"directoryPath": "/path/to/wiki", "recursive": true}'
```

Parameters:
- `directoryPath`: Path to the directory (required)
- `type`: Wiki page type for all files (auto-detected if not provided)
- `recursive`: Search subdirectories recursively (default: false)

Features:
- Batch import of multiple markdown files
- Auto-detects page type from frontmatter
- Handles duplicate slugs by updating existing pages
- Returns import statistics with success/failure counts

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

# Export wiki pages
bun run --filter @sibyl/client export --format json --output backup.json
bun run --filter @sibyl/client export --format markdown --output wiki-bundle.md
```

### Export API

Export wiki pages for backup, sharing, or migration:

```bash
# Export all pages in JSON format (default)
curl http://localhost:3000/api/export

# Export as markdown bundle
curl http://localhost:3000/api/export?format=markdown

# Filter by type
curl http://localhost:3000/api/export?type=concept

# Exclude content or links
curl http://localhost:3000/api/export?includeContent=false
curl http://localhost:3000/api/export?includeLinks=false

# Get export statistics
curl http://localhost:3000/api/export/stats
```

Export features:
- JSON format: Full page data including content, links, and metadata
- Markdown bundle: All pages in one file with wiki link syntax
- Type filtering: Export only specific page types
- Link preservation: Include incoming and outgoing wiki links
- Content options: Include or exclude page content

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
- `memory_filing`: File content or analysis as a wiki page
- `memory_filing_history`: Get filing history

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
- `memory_ingest`: Ingest text content directly and create wiki pages immediately (supports `useLlm` option for LLM-enhanced content generation)
- `memory_raw_save`: Save raw content for later processing
- `memory_query`: Query the knowledge base with a question and return relevant pages
- `memory_log`: Get processing log entries
- `memory_filing`: File content or analysis as a new wiki page with links to source pages
- `memory_filing_history`: Get history of recently filed wiki pages

#### LLM-Enhanced Ingest via MCP

The `memory_ingest` MCP tool supports an optional `useLlm` parameter:

```json
{
  "filename": "document.txt",
  "content": "Raw text content...",
  "title": "My Document",
  "useLlm": true
}
```

When `useLlm` is `true` and LLM is configured, the tool:
- Generates structured wiki content with proper headings
- Extracts summary and tags from the content
- Creates cross-references to existing wiki pages
- Returns `crossReferences` array indicating linked pages

#### Filing Content via MCP

The `memory_filing` MCP tool allows saving valuable content or analysis back into the wiki:

```json
{
  "title": "My Analysis Summary",
  "content": "This analysis shows important trends...",
  "type": "summary",
  "tags": ["analysis", "important"],
  "sourcePageSlugs": ["original-data", "source-concept"],
  "summary": "Brief summary of the filed content"
}
```

When filing content:
- Creates a wiki page with links to source pages
- Supports all wiki page types: entity, concept, source, summary
- Creates wiki links to referenced source pages
- Generates processing log entries

To retrieve filing history:

```json
{
  "limit": 10
}
```

Returns recently filed pages with titles, slugs, and timestamps.

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

## Authentication

Sibyl supports optional authentication for securing API endpoints. When enabled, all API requests require valid authentication.

### Enable Authentication

Set environment variables to enable authentication:

```bash
# Enable authentication
SIBYL_AUTH_ENABLED=true

# Set JWT secret (for Web UI sessions)
SIBYL_JWT_SECRET=your-secure-random-secret

# Set API key (for MCP clients and API access)
SIBYL_API_KEY=sibyl-your-api-key
```

### Authentication Methods

**API Key Authentication**: Use the `x-api-key` header:

```bash
curl -H "x-api-key: sibyl-your-api-key" http://localhost:3000/api/wiki-pages
```

**JWT Authentication**: Use the `Authorization` header with Bearer token:

```bash
# Login to get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sibyl-your-api-key"}'

# Use the token
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/wiki-pages
```

### Auth API Endpoints

```bash
# Check authentication status
curl http://localhost:3000/api/auth/status

# Login with API key (returns JWT token)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "sibyl-your-api-key"}'

# Refresh JWT token
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"token": "<current-token>"}'

# Verify token validity
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Authorization: Bearer <token>"
```

### Web UI Authentication

When authentication is enabled, the Web UI displays an Authentication section where you can login using your API key. The JWT token is stored in localStorage and used for subsequent API requests.

### MCP Plugin Authentication

Configure the plugin with authentication:

```typescript
["@sibyl/plugin", { 
  serverUrl: "http://localhost:3000",
  apiKey: "sibyl-your-api-key"
}]
```

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
│   │   ├── documents/  # PDFs, text files
│   │   ├── webpages/   # Saved web content
│   │   ├── thumbnails/ # Image thumbnails
│   │   └── index.json  # File-based raw resource index
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
- **WebSocket**: @fastify/websocket (real-time updates)

## WebSocket Real-Time Updates

Sibyl provides WebSocket support for real-time updates to the Web UI. When changes occur in the knowledge base, connected clients receive notifications instantly.

## Marp Slide Deck Generation

Sibyl can generate Marp-compatible slide decks from wiki content. Marp is a markdown-based presentation format that can be rendered with tools like Marp CLI or VS Code Marp extension.

### Generate Slides from Wiki Pages

```bash
# Generate slides from specific wiki pages by slug
curl -X POST http://localhost:3000/api/marp \
  -H "Content-Type: application/json" \
  -d '{"pageSlugs": ["concept-1", "concept-2"], "title": "My Presentation"}'

# Generate slides from search query
curl -X POST http://localhost:3000/api/marp \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "title": "ML Overview"}'

# Generate slides with custom theme
curl -X POST http://localhost:3000/api/marp \
  -H "Content-Type: application/json" \
  -d '{"pageSlugs": ["topic"], "theme": "gaia"}'

# Generate slides from specific page
curl http://localhost:3000/api/marp/topic-slug?theme=uncover
```

Parameters:
- `pageIds`: Array of wiki page IDs
- `pageSlugs`: Array of wiki page slugs
- `query`: Search query to find relevant pages
- `type`: Filter by page type (`entity`, `concept`, `source`, `summary`)
- `title`: Custom presentation title
- `theme`: Marp theme (`default`, `gaia`, `uncover`)
- `paginate`: Enable slide pagination (default: true)
- `useLlm`: Use LLM to generate enhanced slides (requires LLM configuration)
- `maxPages`: Maximum wiki pages to include (default: 10)

### Save Marp Content

```bash
# Save generated slides as a wiki page
curl -X POST http://localhost:3000/api/marp/file \
  -H "Content-Type: application/json" \
  -d '{"marpContent": "---\nmarp: true\n---\n# My Deck\n\n---\n# Slide 2\n\nContent", "title": "Saved Presentation", "type": "summary"}'
```

### Marp Themes

- **default**: Standard Marp theme
- **gaia**: Elegant, professional theme
- **uncover**: Modern, minimal theme

### LLM-Enhanced Slides

When LLM is configured, slide generation can use AI to:
- Create structured slide layouts
- Summarize content into bullet points
- Generate cross-references between slides
- Optimize content for presentation format

```bash
curl -X POST http://localhost:3000/api/marp \
  -H "Content-Type: application/json" \
  -d '{"pageSlugs": ["topic"], "useLlm": true, "title": "AI-Generated Presentation"}'
```

### WebSocket Events

The server broadcasts the following events:

- `wiki_page_created`: New wiki page created
- `wiki_page_updated`: Wiki page updated
- `wiki_page_deleted`: Wiki page deleted
- `raw_resource_created`: Raw resource uploaded
- `processing_log_created`: Processing operation logged
- `ingest_completed`: Ingestion finished
- `lint_completed`: Lint check finished
- `query_completed`: Query synthesis finished

### WebSocket Connection

The WebSocket endpoint is available at `/ws`:

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

// Subscribe to specific events
ws.send(JSON.stringify({
  type: "subscribe",
  events: ["wiki_page_created", "wiki_page_updated"]
}));

// Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.payload);
};
```

### WebSocket Stats API

```bash
# Get WebSocket connection stats
curl http://localhost:3000/api/websocket/stats
```

Returns:
```json
{
  "connectedClients": 2,
  "clientIds": ["client-id-1", "client-id-2"]
}
```

## License

MIT
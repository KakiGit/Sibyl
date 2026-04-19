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
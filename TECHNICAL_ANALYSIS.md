# Sibyl Technical Analysis

## Technology Stack

### Core Runtime & Build
| Component | Choice | Version | Reason |
|-----------|--------|---------|--------|
| Runtime | **Bun** | 1.3.x | Same as opencode, fast startup, native TS, built-in APIs |
| Language | **TypeScript** | 5.8.x | Type safety, excellent DX |
| Package Manager | **Bun** | - | Native to runtime, fast installs |
| Monorepo | **Turbo** | 2.x | Build orchestration (optional for single package) |

### Server Infrastructure (Sibyl Server)
| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| HTTP Server | **Fastify** | 5.x | High performance, extensive plugin ecosystem |
| Validation | **Zod** | 4.x | Schema validation, type inference |
| Database | **SQLite** | - | Embedded, fast, zero-config |
| ORM | **Drizzle ORM** | 1.0-beta | Type-safe, lightweight, same as opencode |
| MCP Protocol | **@modelcontextprotocol/sdk** | 1.27.x | Standard for LLM tool integration |

### Memory Processing (LLM Integration)
| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| LLM SDK | **ai (Vercel AI SDK)** | 6.x | Unified interface for all providers |
| Anthropic | **@ai-sdk/anthropic** | 3.x | Claude support |
| OpenAI | **@ai-sdk/openai** | 3.x | GPT support |
| Google | **@ai-sdk/google** | 3.x | Gemini support |
| Embeddings | **@xenova/transformers** | 2.x | Local embeddings, no API cost |

### Document Ingestion
| Component | Choice | Notes |
|-----------|--------|-------|
| PDF Parsing | **pdf-parse** | Pure JS, no external deps |
| HTML → Markdown | **turndown + cheerio** | Same as opencode |
| Image Processing | **sharp** | Metadata extraction, resizing |
| Webpage Fetching | **fetch + JSDOM** | For dynamic content |

### Frontend (Sibyl Web UI)
| Component | Choice | Version | Notes |
|-----------|--------|---------|-------|
| Framework | **React** | 19.x | User preference |
| UI Library | **shadcn/ui** | - | Radix + Tailwind components |
| Styling | **Tailwind CSS** | 4.x | Utility-first CSS |
| State | **TanStack Query** | 5.x | Server state management |
| Router | **TanStack Router** | 1.x | Type-safe routing |
| Bundler | **Vite** | 7.x | Fast HMR, same as opencode |

### CLI (Sibyl Client)
| Component | Choice | Notes |
|-----------|--------|-------|
| Prompts | **@clack/prompts** | Same as opencode/agentmemory |
| Terminal UI | **@opentui/core** | Optional TUI (same as opencode) |
| Argument Parser | **yargs** | Same as opencode |

### Plugin System (Sibyl Plugins)
| Component | Choice | Notes |
|-----------|--------|-------|
| Plugin Interface | **@opencode-ai/plugin pattern** | Hook-based architecture |
| MCP Tools | **Custom implementation** | memory_recall, memory_save, etc. |

---

## Project Structure

```
sibyl/
├── packages/
│   ├── server/          # Sibyl Server (Fastify + MCP)
│   │   ├── src/
│   │   │   ├── index.ts           # Entry point
│   │   │   ├── server.ts          # Fastify server setup
│   │   │   ├── mcp/               # MCP protocol handlers
│   │   │   ├── routes/            # API routes
│   │   │   ├── processors/        # Memory processing (ingest, query, filing, lint)
│   │   │   ├── ingestion/         # Document ingestion (PDF, HTML, images)
│   │   │   ├── embeddings/        # Vector embeddings
│   │   │   ├── storage/           # Database operations
│   │   │   └── types.ts           # TypeScript types
│   │   ├── drizzle/               # Drizzle config
│   │   └── package.json
│   │
│   ├── client/          # Sibyl CLI
│   │   ├── src/
│   │   │   ├── index.ts           # CLI entry
│   │   │   ├── commands/          # CLI commands
│   │   │   │   ├── ingest.ts
│   │   │   │   ├── query.ts
│   │   │   │   ├── file.ts
│   │   │   │   ├── lint.ts
│   │   │   │   └── graph.ts
│   │   └── package.json
│   │
│   ├── web/             # Sibyl Web UI (React)
│   │   ├── src/
│   │   │   ├── routes/            # TanStack Router routes
│   │   │   ├── components/        # React components
│   │   │   ├── hooks/             # Custom hooks
│   │   │   ├── lib/               # Utilities
│   │   │   └── index.css          # Tailwind entry
│   │   ├── components.json        # shadcn/ui config
│   │   └── package.json
│   │
│   ├── plugin/          # Sibyl Plugin for harnesses
│   │   ├── src/
│   │   │   ├── index.ts           # Plugin entry
│   │   │   ├── hooks.ts           # Plugin hooks
│   │   │   ├── tools/             # MCP tools
│   │   └── package.json
│   │
│   ├── sdk/             # Shared SDK/types
│   │   ├── src/
│   │   │   ├── types.ts           # Shared types
│   │   │   ├── schemas.ts         # Zod schemas
│   │   │   ├── client.ts          # API client
│   │   └── package.json
│   │
│   └── shared/          # Shared utilities
│   │   ├── src/
│   │   │   ├── logger.ts
│   │   │   ├── config.ts
│   │   │   └── constants.ts
│   │   └ package.json
│   │
├── data/
│   ├── raw/             # Raw Resources (immutable)
│   │   ├── documents/  # PDFs, images, etc.
│   │   ├── webpages/   # Saved HTML/Markdown
│   │   └── index.json  # Raw resource metadata
│   │
│   ├── wiki/            # Wiki Pages (markdown)
│   │   ├── entities/   # Entity pages (people, places, things)
│   │   ├── concepts/   # Concept pages (ideas, topics)
│   │   ├── sources/    # Source summaries
│   │   ├── index.md    # Wiki index/catalog
│   │   └── log.md      # Chronological log
│   │
│   ├── schema/          # Schema/Configuration
│   │   └── SCHEMA.md    # LLM processing rules
│   │
│   └── db/              # SQLite database
│   │   └── sibyl.db     # Database file
│   │
├── docker/
│   ├── Dockerfile.server
│   ├── Dockerfile.web
│   └── nginx.conf
│   │
├── package.json         # Root package.json
├── turbo.json           # Turborepo config
├── tsconfig.json        # Base TypeScript config
├── bun.lock             # Bun lockfile
├── docker-compose.yml   # Docker orchestration
├── TECHNICAL_ANALYSIS.md
├── EXTERNAL.md
└── DRAFT.md
└── LLM_WIKI.md
```

---

## Dependencies

### Production Dependencies (packages/server)
```json
{
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.1",
    "@fastify/websocket": "^11.0.1",
    "@fastify/static": "^8.0.2",
    "zod": "^4.0.0",
    "drizzle-orm": "1.0.0-beta.19",
    "better-sqlite3": "^11.7.0",
    "@modelcontextprotocol/sdk": "^1.27.1",
    "ai": "^6.0.158",
    "@ai-sdk/anthropic": "^3.0.67",
    "@ai-sdk/openai": "^3.0.48",
    "@ai-sdk/google": "^3.0.53",
    "@xenova/transformers": "^2.17.2",
    "pdf-parse": "^1.1.1",
    "turndown": "^7.2.0",
    "cheerio": "^1.0.0",
    "sharp": "^0.33.5",
    "gray-matter": "^4.0.3",
    "marked": "^17.0.1",
    "ulid": "^3.0.1",
    "dotenv": "^16.4.7"
  }
}
```

### Production Dependencies (packages/web)
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-tabs": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.6",
    "@tanstack/react-query": "^5.91.4",
    "@tanstack/react-router": "^1.104.3",
    "tailwindcss": "^4.1.11",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.0.1",
    "lucide-react": "^0.483.0"
  }
}
```

### Production Dependencies (packages/client)
```json
{
  "dependencies": {
    "@clack/prompts": "^1.2.0",
    "yargs": "^18.0.0",
    "chalk": "^5.4.1",
    "ora": "^8.2.0",
    "@sibyl/sdk": "workspace:*"
  }
}
```

### Dev Dependencies (root)
```json
{
  "devDependencies": {
    "@types/bun": "1.3.11",
    "@types/node": "22.13.9",
    "typescript": "5.8.2",
    "drizzle-kit": "1.0.0-beta.19",
    "vitest": "^3.0.0",
    "@happy-dom/global-registrator": "^20.0.11",
    "turbo": "^2.8.13",
    "husky": "^9.1.7",
    "prettier": "^3.6.2"
  }
}
```

---

## Database Schema (Drizzle)

### Raw Resources Table
```typescript
sqliteTable("raw_resources", {
  id: text().primaryKey(),
  type: text({ enum: ["pdf", "image", "webpage", "text"] }).notNull(),
  filename: text().notNull(),
  source_url: text(),
  content_path: text().notNull(),
  metadata: text(), // JSON string
  created_at: integer().notNull(),
  processed: integer({ default: 0 }),
})
```

### Wiki Pages Table
```typescript
sqliteTable("wiki_pages", {
  id: text().primaryKey(),
  slug: text().unique().notNull(),
  title: text().notNull(),
  type: text({ enum: ["entity", "concept", "source", "summary"] }).notNull(),
  content_path: text().notNull(),
  summary: text(),
  tags: text(), // JSON array
  source_ids: text(), // JSON array of raw_resource IDs
  embedding_id: text(),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
  version: integer({ default: 1 }),
})
```

### Wiki Links Table
```typescript
sqliteTable("wiki_links", {
  id: text().primaryKey(),
  from_page_id: text().notNull().references(() => wiki_pages.id),
  to_page_id: text().notNull().references(() => wiki_pages.id),
  relation_type: text().notNull(),
  created_at: integer().notNull(),
})
```

### Processing Log Table
```typescript
sqliteTable("processing_log", {
  id: text().primaryKey(),
  operation: text({ enum: ["ingest", "query", "filing", "lint"] }).notNull(),
  raw_resource_id: text(),
  wiki_page_id: text(),
  details: text(), // JSON
  created_at: integer().notNull(),
})
```

### Embeddings Cache Table
```typescript
sqliteTable("embeddings_cache", {
  id: text().primaryKey(),
  content_hash: text().unique().notNull(),
  embedding: text().notNull(), // JSON array
  model: text().notNull(),
  created_at: integer().notNull(),
})
```

---

## Key Architectural Decisions

### 1. SQLite + Drizzle ORM
- **Rationale**: Provides structured queries for wiki pages and raw resources while maintaining simplicity
- **Alternative Considered**: PostgreSQL (rejected - adds deployment complexity for personal use)
- **Migration Path**: Can migrate to PostgreSQL later if multi-user/team features are added

### 2. Fastify + Zod
- **Rationale**: Better plugin system than Hono, well-suited for MCP tool registration
- **Alternative Considered**: Hono (opencode's choice - lighter but less plugin ecosystem)
- **Benefits**: Type-safe API validation, WebSocket support, easy MCP integration

### 3. Vercel AI SDK
- **Rationale**: Unified interface allows swapping providers without code changes
- **Alternative Considered**: Direct Anthropic SDK (rejected - limits provider flexibility)
- **Benefits**: Streaming support, multi-provider, active maintenance

### 4. Local Embeddings (@xenova/transformers)
- **Rationale**: Zero-cost semantic search, privacy-friendly, suitable for personal knowledge base
- **Alternative Considered**: OpenAI embeddings API (rejected - adds cost and latency)
- **Fallback**: Can add cloud embeddings as optional fallback

### 5. React + shadcn/ui
- **Rationale**: Rich ecosystem, familiar to many developers, excellent component library
- **Alternative Considered**: SolidJS (opencode's choice - rejected based on user preference)
- **Benefits**: Large community, excellent docs, customizable components

### 6. MCP Protocol Integration
- **Rationale**: Standard protocol for LLM tool integration, supported by opencode, Claude Code, Cursor
- **Alternative Considered**: Custom REST API (rejected - not compatible with harnesses)
- **Benefits**: Plug-and-play integration with existing coding harnesses

---

## Performance Considerations

### Embedding Generation
- Use batch processing for multiple documents
- Cache embeddings by content hash to avoid recomputation
- Consider lazy loading of transformer models

### Wiki Search
- SQLite FTS5 extension for full-text search
- Vector similarity search using cached embeddings
- Hybrid search (keyword + semantic) for best results

### Memory Processing
- Process raw resources asynchronously (queue-based)
- Use WebSocket for real-time updates to Web UI
- Batch wiki updates to reduce database writes

---

## Security Considerations

### API Authentication
- JWT-based authentication for Web UI
- API key for MCP integration
- Optional OAuth for multi-user scenarios

### Data Privacy
- All data stored locally by default
- No external API calls for embeddings (local models)
- Optional encryption for sensitive data

### File Access
- Sandbox file operations to data directory
- Validate file paths to prevent directory traversal
- Rate limit ingestion operations

---

## References

- **opencode**: ~/Github/opencode - Plugin architecture, MCP integration patterns
- **agentmemory**: ~/Github/agentmemory - Memory processing, iii-sdk patterns, MCP tools
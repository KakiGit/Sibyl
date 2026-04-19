# External Services (Docker)

External services for local development. Start with `docker-compose-external.yml`.

---

## Quick Start

```bash
# Basic (Redis + MinIO)
docker-compose -f docker-compose-external.yml up -d

# With PostgreSQL
docker-compose -f docker-compose-external.yml --profile postgres up -d

# With Elasticsearch
docker-compose -f docker-compose-external.yml --profile search up -d

# With Qdrant (vector DB)
docker-compose -f docker-compose-external.yml --profile vector up -d

# All services
docker-compose -f docker-compose-external.yml --profile postgres --profile search --profile vector up -d

# Stop all
docker-compose -f docker-compose-external.yml down

# Stop and remove volumes
docker-compose -f docker-compose-external.yml down -v
```

---

## Services Overview

| Service | Port | Profile | Default | Description |
|---------|------|---------|---------|-------------|
| Redis | 6379 | - | Yes | Caching, job queue, session storage |
| MinIO | 9000, 9001 | - | Yes | S3-compatible object storage |
| PostgreSQL | 5432 | `postgres` | No | Alternative to SQLite |
| Elasticsearch | 9200 | `search` | No | Full-text search engine |
| Qdrant | 6333 | `vector` | No | Vector database for embeddings |

---

## Redis

**Use Case**: Caching, job queue, rate limiting, session storage

### Connection

```bash
# Connection URL
redis://localhost:6379
```

### CLI Access

```bash
# Redis CLI
docker-compose -f docker-compose-external.yml exec redis redis-cli

# Or local redis-cli
redis-cli -h localhost -p 6379
```

### TypeScript Integration

```typescript
import Redis from 'ioredis'

const redis = new Redis('redis://localhost:6379')

// Basic operations
await redis.set('key', 'value', 'EX', 3600)  // Set with 1h expiry
const value = await redis.get('key')

// Cache embeddings
await redis.set(`embedding:${hash}`, JSON.stringify(embedding), 'EX', 86400)

// Job queue (LPUSH/RPOP)
await redis.lpush('sibyl:queue:ingest', JSON.stringify({ resourceId, priority }))
const job = await redis.rpop('sibyl:queue:ingest')

// Pub/Sub
await redis.subscribe('sibyl:events')
redis.on('message', (channel, message) => {
  console.log(channel, message)
})
```

### Health Check

```bash
docker-compose -f docker-compose-external.yml exec redis redis-cli ping
# Response: PONG
```

---

## MinIO

**Use Case**: Large file storage, backups, S3-compatible API

### Connection

| Endpoint | URL |
|----------|-----|
| API | `http://localhost:9000` |
| Console | `http://localhost:9001` |

| Credentials | Value |
|-------------|-------|
| Username | `sibyl` |
| Password | `sibyl-password` |

### Console Access

Open `http://localhost:9001` in browser. Login with:
- Username: `sibyl`
- Password: `sibyl-password`

### TypeScript Integration

```typescript
import * as Minio from 'minio'

const minio = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'sibyl',
  secretKey: 'sibyl-password',
})

// Create bucket
await minio.makeBucket('sibyl-raw')

// Upload file
await minio.fPutObject('sibyl-raw', 'document.pdf', '/path/to/document.pdf')

// Download file
await minio.fGetObject('sibyl-raw', 'document.pdf', '/path/to/download.pdf')

// List objects
const objects = await minio.listObjects('sibyl-raw', '', true)
for await (const obj of objects) {
  console.log(obj.name, obj.size)
}

// Get object URL
const url = await minio.presignedGetObject('sibyl-raw', 'document.pdf', 24 * 60 * 60)
```

### mc CLI (MinIO Client)

```bash
# Install mc
brew install minio/stable/mc  # macOS
# or download from https://min.io/docs/minio/linux/reference/minio-mc.html

# Configure alias
mc alias set sibyl http://localhost:9000 sibyl sibyl-password

# List buckets
mc ls sibyl

# Upload file
mc cp document.pdf sibyl/sibyl-raw/

# Download file
mc cp sibyl/sibyl-raw/document.pdf ./download.pdf
```

### Health Check

```bash
curl http://localhost:9000/minio/health/live
# Response: OK (empty body with 200 status)
```

---

## PostgreSQL

**Use Case**: Alternative to SQLite for production, multi-user, team features

**Profile**: `postgres` (not started by default)

### Connection

```bash
# Connection URL
postgresql://sibyl:sibyl-password@localhost:5432/sibyl
```

| Parameter | Value |
|-----------|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `sibyl` |
| Username | `sibyl` |
| Password | `sibyl-password` |

### CLI Access

```bash
# psql in container
docker-compose -f docker-compose-external.yml exec postgres psql -U sibyl -d sibyl

# Local psql
psql -h localhost -U sibyl -d sibyl
# Password: sibyl-password
```

### TypeScript Integration (Drizzle ORM)

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgresql://sibyl:sibyl-password@localhost:5432/sibyl',
})
const db = drizzle(pool)

// Query
const pages = await db.select().from(wikiPages)

// Insert
await db.insert(wikiPages).values({
  id: ulid(),
  slug: 'my-entity',
  title: 'My Entity',
})
```

### Drizzle Config for PostgreSQL

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  dbCredentials: {
    url: 'postgresql://sibyl:sibyl-password@localhost:5432/sibyl',
  },
})
```

### Health Check

```bash
docker-compose -f docker-compose-external.yml exec postgres pg_isready -U sibyl
# Response: localhost:5432 - accepting connections
```

---

## Elasticsearch

**Use Case**: Full-text search, advanced querying, analytics

**Profile**: `search` (not started by default)

### Connection

```bash
# HTTP endpoint
http://localhost:9200
```

### CLI Access

```bash
# curl
curl http://localhost:9200

# Check cluster health
curl http://localhost:9200/_cluster/health
```

### TypeScript Integration

```typescript
import { Client } from '@elastic/elasticsearch'

const es = new Client({ node: 'http://localhost:9200' })

// Create index
await es.indices.create({ index: 'wiki-pages' })

// Index document
await es.index({
  index: 'wiki-pages',
  id: 'page-1',
  document: {
    title: 'My Wiki Page',
    content: 'Full text content...',
    tags: ['entity', 'concept'],
  },
})

// Search
const result = await es.search({
  index: 'wiki-pages',
  query: {
    match: { content: 'search query' },
  },
})

for (const hit of result.hits.hits) {
  console.log(hit._source)
}
```

### Health Check

```bash
curl http://localhost:9200/_cluster/health?pretty
# Response: { "status": "green", ... }
```

---

## Qdrant

**Use Case**: Vector database for semantic search, embeddings storage

**Profile**: `vector` (not started by default)

### Connection

| Endpoint | URL |
|----------|-----|
| HTTP API | `http://localhost:6333` |
| gRPC | `localhost:6334` |

### CLI Access

```bash
# Check health
curl http://localhost:6333/health

# Web UI (optional)
curl http://localhost:6333/dashboard
```

### TypeScript Integration

```typescript
import { QdrantClient } from '@qdrant/js-client-rest'

const qdrant = new QdrantClient({ url: 'http://localhost:6333' })

// Create collection
await qdrant.createCollection('wiki-embeddings', {
  vectors: {
    size: 384,  // all-MiniLM-L6-v2 dimension
    distance: 'Cosine',
  },
})

// Upsert vectors
await qdrant.upsert('wiki-embeddings', {
  wait: true,
  points: [
    {
      id: 'page-1',
      vector: embedding,  // number[384]
      payload: { title: 'My Wiki Page', slug: 'my-entity' },
    },
  ],
})

// Search
const result = await qdrant.search('wiki-embeddings', {
  vector: queryEmbedding,
  limit: 10,
})

for (const hit of result) {
  console.log(hit.id, hit.score, hit.payload)
}
```

### Health Check

```bash
curl http://localhost:6333/health
# Response: { "title": "qdrant: vector search engine", ... }
```

---

## Service Status Commands

```bash
# List running containers
docker-compose -f docker-compose-external.yml ps

# View logs
docker-compose -f docker-compose-external.yml logs -f redis
docker-compose -f docker-compose-external.yml logs -f minio

# Check all services health
docker-compose -f docker-compose-external.yml ps --format "table {{.Name}}\t{{.Status}}"
```

---

## Connection Strings Summary

| Service | Connection String |
|---------|-------------------|
| Redis | `redis://localhost:6379` |
| MinIO API | `http://localhost:9000` |
| MinIO Console | `http://localhost:9001` (user: `sibyl`, pass: `sibyl-password`) |
| PostgreSQL | `postgresql://sibyl:sibyl-password@localhost:5432/sibyl` |
| Elasticsearch | `http://localhost:9200` |
| Qdrant | `http://localhost:6333` |

---

## Environment Variables for Services

```bash
# .env file for local development
SIBYL_REDIS_URL=redis://localhost:6379
SIBYL_MINIO_ENDPOINT=localhost
SIBYL_MINIO_PORT=9000
SIBYL_MINIO_ACCESS_KEY=sibyl
SIBYL_MINIO_SECRET_KEY=sibyl-password
SIBYL_PG_URL=postgresql://sibyl:sibyl-password@localhost:5432/sibyl
SIBYL_ES_URL=http://localhost:9200
SIBYL_QDRANT_URL=http://localhost:6333
```

---

## Connection Test Results (2026-04-19)

All services verified operational:

| Service | Status | Details |
|---------|--------|---------|
| **Redis** (6379) | OK | `PING` → `+PONG`, SET/GET/DEL operations verified |
| **MinIO API** (9000) | OK | Health endpoint responding, Console UI accessible |
| **MinIO Console** (9001) | OK | Web UI serving React app |
| **PostgreSQL** (5432) | OK | Port open, accepting connections |
| **Elasticsearch** (9200) | OK | Cluster status: `green`, version 8.17.0 |
| **Qdrant** (6333) | OK | Version 1.17.1, collections API working |

### Test Commands Used

```bash
# Redis TCP test
timeout 2 bash -c 'exec 3<>/dev/tcp/localhost/6379 && echo "PING" >&3 && head -1 <&3'
# Output: +PONG

# Redis SET/GET/DEL test
timeout 2 bash -c 'exec 3<>/dev/tcp/localhost/6379 && echo "SET test_key test_value" >&3'
# Output: +OK

# MinIO health
curl -s http://localhost:9000/minio/health/live
# Output: OK (200 status)

# MinIO Console
curl -s http://localhost:9001
# Output: HTML (MinIO Console React app)

# PostgreSQL port
timeout 2 bash -c 'exec 3<>/dev/tcp/localhost/5432'
# Connection successful

# Elasticsearch cluster health
curl -s http://localhost:9200/_cluster/health
# Output: {"status":"green","number_of_nodes":1,...}

# Elasticsearch version
curl -s http://localhost:9200
# Output: {"version":{"number":"8.17.0"},...}

# Qdrant collections
curl -s http://localhost:6333/collections
# Output: {"result":{"collections":[]},"status":"ok"}

# Qdrant version
curl -s http://localhost:6333
# Output: {"title":"qdrant - vector search engine","version":"1.17.1"}
```
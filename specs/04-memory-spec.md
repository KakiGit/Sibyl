# Memory System Specification

## Framework: Graphiti + FalkorDB

### Why Graphiti

- Temporal context graphs (facts have validity windows)
- Automatic entity extraction from conversations
- Provenance tracking (facts → source episodes)
- Hybrid retrieval (semantic + keyword + graph traversal)
- MCP server included for direct integration
- Apache 2.0 license

### Why FalkorDB

- Embedded graph database (Redis-based)
- Simple setup: `docker run -p 6379:6379 falkordb/falkordb`
- Supports vector search + graph queries
- Lightweight, runs alongside Sibyl

## Memory Architecture

### Graphiti Context Graph Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Episodes (Provenance)                    │
│  Raw conversation content stored as ground truth             │
│  Every entity/fact traces back to its source episode         │
└─────────────────────────────────────────────────────────────┘
              ↓ Entity Extraction (LLM-based)
┌─────────────────────────────────────────────────────────────┐
│                     Entities (Nodes)                         │
│  user, project, file, preference, concept, tool              │
│  Each entity has an evolving summary                         │
└─────────────────────────────────────────────────────────────┘
              ↓ Fact/Relationship Creation
┌─────────────────────────────────────────────────────────────┐
│                   Facts (Edges with Temporal Validity)       │
│  "User prefers dark mode" → valid: Jan 1 to Jun 15          │
│  "User prefers light mode" → valid: Jun 15 to present       │
│  Facts auto-invalidate when contradicted                     │
└─────────────────────────────────────────────────────────────┘
              ↓ Community Detection
┌─────────────────────────────────────────────────────────────┐
│                    Communities                               │
│  Related entities clustered together                         │
│  Enables efficient graph traversal                           │
└─────────────────────────────────────────────────────────────┘
```

### Temporal Fact Management

Graphiti tracks when facts become true and when they become invalid:

```
Timeline:
─────────────────────────────────────────────────────────────►
Jan 1              Jun 15                  Present

Fact 1: "User prefers dark mode"
  ├─ Valid: Jan 1 → Jun 15 (superseded)
  └─ Episode source: conversation about editor setup

Fact 2: "User prefers light mode"
  ├─ Valid: Jun 15 → Present (current)
  └─ Episode source: conversation about eye strain
  └─ Supersedes: Fact 1
```

### Hybrid Search Strategy

1. **Semantic Search**: Vector embeddings find conceptually similar content
2. **Keyword Search (BM25)**: Exact term matching for precise queries
3. **Graph Traversal**: Find entities connected to relevant nodes

Query flow:
```
Query: "What editor does user prefer?"
  │
  ├─► Semantic search: finds "editor", "preferences", "VSCode"
  │
  ├─► Keyword search: finds exact "VSCode", "prefers"
  │
  ├─► Graph traversal: user → prefers → VSCode
  │
  └─► Merge & rank results → Return top facts
```

## Python Module Structure

```
python/
├── sibyl_memory/
│   ├── __init__.py
│   ├── main.py                  # Entry point, IPC server
│   ├── graphiti_client.py       # Graphiti initialization & config
│   ├── episode_manager.py       # Conversation ingestion
│   ├── search.py                # Hybrid search implementation
│   ├── context_builder.py       # Assemble relevant context
│   ├── relevance_filter.py      # Subagent-based filtering
│   ├── types.py                 # Data structures
│   ├── embedder/
│   │   ├── __init__.py
│   │   ├── local.py             # sentence-transformers config
│   │   └── config.py            # Embedding model settings
│   └── llm/
│   │   ├── __init__.py
│   │   ├── ollama.py            # Ollama client for entity extraction
│   │   └── config.py            # LLM configuration
│   └── ipc/
│   │   ├── __init__.py
│   │   ├── server.py            # JSON-RPC server
│   │   ├── handlers.py          # Method handlers
│   │   └── protocol.py          # JSON-RPC types
```

## Embedding Configuration

### Local Embeddings (Default)

Using sentence-transformers for offline capability:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')
# Dimensions: 384
# Speed: ~15ms per sentence on CPU
```

Alternative models:
- `all-MiniLM-L6-v2`: Fast, 384 dims (recommended)
- `gte-Qwen2-1.5B-instruct`: Higher quality, 1536 dims
- `bge-small-en-v1.5`: Good for English, 384 dims

### Graphiti Configuration

```python
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from sentence_transformers import SentenceTransformer

# FalkorDB connection
driver = FalkorDriver(
    host="localhost",
    port=6379,
    database="sibyl_memory"
)

# Local embedder
class LocalEmbedder:
    def __init__(self):
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
    
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return self.model.encode(texts).tolist()

# Initialize Graphiti
graphiti = Graphiti(
    graph_driver=driver,
    embedder=LocalEmbedder(),
    llm_client=OllamaClient(model="llama3.2")  # For entity extraction
)
```

## IPC Interface

### JSON-RPC Methods

| Method | Params | Returns | Description |
|--------|--------|---------|-------------|
| `memory.query` | `query`, `session_id`, `limit` | `{facts, entities}` | Search relevant memories |
| `memory.add_episode` | `content`, `session_id`, `source` | `{episode_id}` | Ingest conversation |
| `memory.get_context` | `session_id`, `max_tokens` | `{context_str}` | Assembled context string |
| `memory.get_entities` | `entity_type`, `limit` | `{entities}` | List known entities |
| `memory.invalidate_fact` | `fact_id`, `reason` | `{success}` | Mark fact as superseded |
| `memory.clear_session` | `session_id` | `{success}` | Clear session memories |

### Example Request/Response

**Query Request:**
```json
{
    "jsonrpc": "2.0",
    "method": "memory.query",
    "params": {
        "query": "user coding preferences",
        "session_id": "sess-123",
        "limit": 5
    },
    "id": 1
}
```

**Query Response:**
```json
{
    "jsonrpc": "2.0",
    "result": {
        "facts": [
            {
                "uuid": "fact-456",
                "content": "User prefers VSCode with vim keybindings",
                "source_node": "user",
                "target_node": "VSCode",
                "valid_at": "2024-01-15T10:00:00Z",
                "invalid_at": null,
                "score": 0.92
            },
            {
                "uuid": "fact-789",
                "content": "User prefers dark theme in editor",
                "source_node": "user",
                "target_node": "dark_mode",
                "valid_at": "2024-01-01T00:00:00Z",
                "invalid_at": "2024-06-15T00:00:00Z",
                "score": 0.85,
                "superseded_by": "fact-101"
            }
        ],
        "entities": [
            {"name": "user", "summary": "Developer using VSCode"},
            {"name": "VSCode", "summary": "Primary editor choice"},
            {"name": "vim", "summary": "Keybinding preference"}
        ],
        "episodes": [
            {"uuid": "ep-001", "content": "Conversation about editor setup"}
        ]
    },
    "id": 1
}
```

## Entity Extraction

### Custom Entity Types for Sibyl

```python
from graphiti_core.edges import EntityModel
from pydantic import Field

class Project(EntityModel):
    """A code project being worked on"""
    language = Field(description="Primary programming language")
    framework = Field(description="Framework being used")
    
class File(EntityModel):
    """A source file in the project"""
    path = Field(description="File path relative to project root")
    purpose = Field(description="What this file does")
    
class Preference(EntityModel):
    """User preference or configuration choice"""
    category = Field(description="Type of preference: editor, style, workflow")
    value = Field(description="The preference setting")
    
class Decision(EntityModel):
    """A past decision made in code"""
    reason = Field(description="Why this decision was made")
    outcome = Field(description="Result of the decision")
```

## Context Assembly

### Building Memory Context for Prompt

```python
async def build_context(session_id: str, max_tokens: int = 2000) -> str:
    # 1. Get recent facts
    facts = await graphiti.search(
        query="",  # Empty query gets most recent
        limit=10,
        group_id=session_id
    )
    
    # 2. Filter by relevance (subagent evaluation)
    relevant_facts = await relevance_filter(facts)
    
    # 3. Format as context string
    context = format_memory_context(relevant_facts)
    
    # 4. Ensure token limit
    if estimate_tokens(context) > max_tokens:
        context = truncate_context(context, max_tokens)
    
    return context
```

### Context Format

```
# Relevant Memory Context

## User Preferences
- Uses VSCode with vim keybindings (since Jan 2024)
- Prefers dark theme (superseded Jun 2024 → now prefers light theme)

## Project Knowledge  
- Working on Sibyl project (Rust + Python hybrid)
- Using Ratatui for TUI

## Past Decisions
- Chose Graphiti for memory (reason: temporal facts, provenance)
- Selected FalkorDB over Neo4j (reason: simpler setup)

## Files Recently Discussed
- src/main.rs (TUI entry point)
- python/sibyl_memory/ (memory layer)
```

## Docker Setup for FalkorDB

```yaml
# docker-compose.yml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
    volumes:
      - falkordb_data:/data
    environment:
      - FALKORDB_ARGS=--save 60 1

volumes:
  falkordb_data:
```

## Configuration File

```yaml
# config/sibyl.yaml
memory:
  backend: falkordb
  
  falkordb:
    host: localhost
    port: 6379
    database: sibyl_memory
    
  embedding:
    model: sentence-transformers/all-MiniLM-L6-v2
    local: true
    dimensions: 384
    
  graphiti:
    llm: ollama/llama3.2    # For entity extraction
    entity_types:
      - user
      - project
      - file
      - preference
      - decision
      - concept
    temporal_tracking: true
    
  context:
    max_tokens: 2000
    relevance_threshold: 0.7
```

## Dependencies

```
# pyproject.toml
[project]
dependencies = [
    "graphiti-core[falkordb]>=0.17.0",
    "sentence-transformers>=2.2.0",
    "ollama>=0.1.0",
    "pydantic>=2.0.0",
    "jsonrpc-server>=0.5.0",
    "asyncio>=3.4.0",
]
```
# Sibyl - Agent Instructions

## Project State
**Python layer implemented and tested.** IPC server, memory system, prompt building, and relevance evaluation are working. See `python/` for implementation.

## Running the System
```bash
# Start Sibyl (auto-starts Python IPC server internally)
cargo run
```

## Configuration
Config file: `~/.config/sibyl/config.yaml`
- **Memory**: SimpleMemoryStore (no LLM dependency, embedding-based search)
- **IPC Server**: Optimized version (`sibyl_ipc_server.__main_optimized__`)
- **Embeddings**: `all-MiniLM-L6-v2` (384 dimensions, CPU)
- **OpenCode**: Configurable URL and model from config file
- **FalkorDB/Redis**: `localhost:6379`

## Config Example
```yaml
harness:
  default: opencode
  opencode:
    url: http://localhost:4096
    model: glm-5

ipc:
  socket_path: /tmp/sibyl-ipc.sock

dependencies:
  python_ipc:
    mode: auto
    spawn_command: python -u -m sibyl_ipc_server.__main_optimized__
    startup_timeout: 15s
```

## Performance Metrics (Headless IPC Test - 2026-04-16 16:38)
- IPC connect: 0.000s
- Memory add_episode: 0.014s
- Memory query: 0.013s
- Memory get_context: 0.013s
- Prompt build: 0.164s (cached environment info, optimized language detection)
- Relevance evaluate: 0.026s (embedding-based, cached)
- OpenCode session create: 0.006s
- OpenCode list sessions: 0.010s
- OpenCode send message: 5.732s (LLM response time, depends on model)
- Total IPC runtime (excluding embedder init): ~0.24s
- Embedder init: ~8s (one-time startup cost)

## Full Test Suite Metrics (2026-04-16 16:38)
- Redis connect: 0.004s
- Store init: 0.000s
- Add 10 episodes: 0.103s (0.010s avg)
- Search: 0.039s (5 results)
- Relevance eval: 0.019s (1 relevant)
- Prompt build: 0.153s
- OpenCode connect: 0.002s
- Total runtime: ~0.33s (excluding embedder init)

## Architecture
Hybrid Rust + Python:
- **Rust**: TUI (ratatui), core orchestration, harness integration, auto-starts Python IPC server
- **Python**: Memory system (SimpleMemoryStore + FalkorDB), prompt building, embedding-based relevance
- **IPC**: JSON-RPC 2.0 over Unix domain sockets

## Directory Structure (Planned)
```
sibyl/
├── crates/              # Rust workspace
│   ├── sibyl-tui/       # TUI application
│   ├── sibyl-core/      # Core orchestration
│   ├── sibyl-opencode/  # OpenCode harness
│   ├── sibyl-ipc/       # IPC communication
│   └── sibyl-plugin/    # Plugin system
├── python/              # Python components
│   ├── sibyl_memory/    # SimpleMemoryStore + FalkorDB
│   ├── sibyl_prompt/    # Prompt assembly
│   └── sibyl_ipc_server/
├── plugins/             # Built-in plugins
└── specs/               # Implementation specs
```

## Reference Implementations
Learn patterns from:
- `~/Github/claw-code` - Rust TUI, Python prompts, IPC bridge
- `~/Github/opencode` - REST API, session management, skills
- `~/Github/codex` - JSONL persistence, MCP integration

## Dependencies
- FalkorDB requires Docker: `docker run -d -p 6379:6379 falkordb/falkordb`
- Python: `sentence-transformers`, `jinja2`, `httpx`
- Rust: `ratatui`, `crossterm`, `tokio`, `reqwest`

## Development Order (from MVP roadmap)
1. Rust workspace + basic TUI shell
2. IPC bridge prototype (ping-pong test)
3. FalkorDB + Graphiti setup
4. OpenCode REST client
5. Memory query integration
6. Prompt building + relevance evaluation

## IPC Messages
- `memory.query` - Search relevant memories
- `memory.add_episode` - Ingest conversation
- `prompt.build` - Build system prompt with memory injection
- `relevance.evaluate` - Subagent evaluates memory relevance

## Note

* **ALWAYS** make a git commit after completing a feature.
* **DO NOT** push the change.

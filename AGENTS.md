# Sibyl - Agent Instructions

## Project State
**Python layer implemented and tested.** IPC server, memory system, prompt building, and relevance evaluation are working. See `python/` for implementation.

## Running the System
```bash
# Start optimized IPC server (SimpleMemoryStore - recommended)
cd python && python -m sibyl_ipc_server.__main_optimized__

# Run full test suite
cd python && python run_test_suite.py

# Run headless IPC test (requires running IPC server)
cd python && python test_headless.py
```

## Configuration (Optimized for limited hardware)
- LLM: `qwen2.5:0.5b` via Ollama at `127.0.0.1:11434` (minimal LLM usage)
- Memory: SimpleMemoryStore (no entity extraction, embedding-based search)
- Embeddings: `all-MiniLM-L6-v2` (384 dimensions, CPU)
- OpenCode: `127.0.0.1:4096`
- FalkorDB/Redis: `localhost:6379`

## Performance Metrics (Headless IPC Test - 2026-04-16 16:12)
- IPC connect: 0.000s
- Memory add_episode: 0.011s
- Memory query: 0.011s
- Memory get_context: 0.011s
- Prompt build: 0.013s (optimized template with whitespace control)
- Relevance evaluate: 0.000s (cached, embedding-based)
- OpenCode session create: 0.006s
- OpenCode list sessions: 0.017s
- Total IPC runtime (excluding embedder init): ~0.05s
- Embedder init: ~8s (one-time startup cost)
- OpenCode send message: ~4-7s (LLM response time, depends on model)

## Previous Performance Metrics
- IPC latency: 0.01-0.02s (tested 2026-04-16 12:35)
- Memory add episode: 0.01-0.02s (with Graphiti)
- Full test with Graphiti: 15.11s (includes entity extraction)

## Architecture
Hybrid Rust + Python:
- **Rust**: TUI (ratatui), core orchestration, harness integration, plugins
- **Python**: Memory system (Graphiti + FalkorDB), prompt building, relevance evaluation
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
│   ├── sibyl_memory/    # Graphiti + FalkorDB
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
- Python: `graphiti-core[falkordb]`, `sentence-transformers`
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

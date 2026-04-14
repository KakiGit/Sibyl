# Sibyl - Agent Instructions

## Project State
Specification phase. No implementation exists yet. See `specs/` for detailed specs.

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

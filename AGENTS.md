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

## Performance Metrics (Headless IPC Test - 2026-04-16)
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

## Baseline Verified (2026-04-17 - Reconfirmed)
- Config loaded from ~/.config/sibyl/config.yaml ✓
  - Harness: opencode (url: http://localhost:4096, model: glm-5)
  - IPC: /tmp/sibyl-ipc.sock
  - Dependencies: auto-start enabled
- Headless mode: `./target/release/sibyl run --prompt "..." --json` ✓
  - Prompt sent to OpenCode harness
  - Memories retrieved (10 most relevant) and injected
  - Response received from harness
  - Memory stored after conversation
- Memory system: `./target/release/sibyl memory --query "..." --json` ✓
  - Real-time natural language query
  - Returns episodes, facts, and relevance scores
- Dependencies auto-started ✓
  - Python IPC server (optimized version)
  - FalkorDB/Redis at localhost:6379
  - OpenCode harness at localhost:4096
- TUI tests: 21/22 passed ✓ (2026-04-17, SSE fixes applied)
  - Basic tests: welcome screen, keybindings, help overlay, command palette, status bar
  - Message tests: send message, queue messages, queue panel display
  - Flow tests: nonblocking input, queue processing
  - Note: full-flow tests (2) timeout due to LLM response latency (expected)
  - Requires Node.js 20.X LTS via fnm
- UX Optimization (2026-04-17): Animated spinner for streaming indicator ✓
- Bug fix (2026-04-17): Added `session.created` SSE event handling ✓
- Fixed MODULE_TYPELESS_PACKAGE_JSON warning by adding "type": "module" to tui-tests/package.json ✓
- SSE Fix (2026-04-17): Refactored background task for concurrent SSE polling ✓
  - Added Clone derive to OpenCodeClient
  - Fixed Part enum to handle extra SSE event fields
  - Separate SSE polling thread with shared session state

## TUI Testing
- tui-test framework setup in `tui-tests/` directory
- Run: `cd tui-tests && npm install && npm run test:tui`
- Tests cover: welcome screen, keybindings, help overlay, command palette, status bar, message flow
- Package: `@microsoft/tui-test ^0.0.4`
- **Note**: Node.js 25.X is NOT supported. Use Node.js 20.X LTS.
  - Install fnm: `sudo pacman -S fnm` (Arch Linux)
  - Use Node 20: `eval "$(fnm env --shell bash)" && fnm use 20`
- Tests verified (2026-04-17): 21/22 passed
  - basic.test.ts: 6/6 passed - welcome screen, keybindings hint, command hints, help overlay, command palette, status bar
  - tests/single-message.test.ts: 3/3 passed - send message, queue messages, You indicator
  - tests/nonblocking.test.ts: 3/3 passed - typed text, responsive input, processing state
  - tests/queue-flow.test.ts: 4/4 passed - first message, queued messages, queue count, input clear
  - tests/messages.test.ts: 5/5 passed - send message, queue messages, queue panel, input field
  - tests/full-flow.test.ts: 0/2 passed - timeout (LLM response latency, expected)

## Feature Status (from DRAFT.md)
### Implemented ✓
- Memory query and add operations (embedding-based search)
- Automatic context injection with relevance filtering
- Subagent relevance evaluation (embedding + optional LLM)
- OpenCode harness integration (full implementation)
- Plugin system framework (skills/tools/workflows/MCP registries)

### Missing (TODO)
- Memory modify/delete operations for individual memories
- Cursor, Claude Code, mCodex harness implementations
- Harness switching functionality (stub only)
- Memory management UI for modify/delete in TUI
- Multiple instance isolation/synchronization

## Test Commands
```bash
# Headless mode
./target/release/sibyl run --prompt "Hello, what is 2+2?"
./target/release/sibyl run --prompt "Remember that I like Python programming" --json

# Memory query
./target/release/sibyl memory --query "What programming languages does the user like?" --json

# TUI with debug logging (useful for troubleshooting)
./target/release/sibyl tui --log
./target/release/sibyl tui --log-file /tmp/sibyl-debug.log

# TUI tests (requires Node.js 20.X)
cd tui-tests
eval "$(fnm env --shell bash)" && fnm use 20
npm run test:tui

# Cargo tests
cargo test --package sibyl-deps test_load_config -- --nocapture
```

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
* **ALWAYS** make sure `cargo build` working before making a commit.

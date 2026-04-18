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

## Baseline Verified (2026-04-18 - Latest)
- Build: successful ✓ (cargo build --release, binary: 12MB)
- Config: ~/.config/sibyl/config.yaml ✓
  - Harness: opencode (url: http://localhost:4096, model: glm-5)
  - IPC: /tmp/sibyl-ipc.sock
  - Dependencies: auto-start enabled
- Dependencies: FalkorDB (localhost:6379) ✓, OpenCode (localhost:4096) ✓, Python IPC ✓
- Headless: `./target/release/sibyl run --prompt "..." --json` ✓
  - Prompt sent to OpenCode harness
  - Memories retrieved (10 most relevant) and injected
  - Response received from harness
  - Memory stored after conversation
  - Context injection working: memories injected into prompt for LLM context
  - Verified: Query about user preferences shows memory-based response
- Memory Operations (NEW): ✓
  - `./target/release/sibyl memory query --query "..." --json` - Real-time natural language query ✓
  - `./target/release/sibyl memory list --json` - List all memories ✓
  - `./target/release/sibyl memory modify <id> --content "..." --json` - Modify memory ✓
  - `./target/release/sibyl memory delete <id> --json` - Delete memory ✓
  - Verified: Modify changes content, adds modified_at timestamp
  - Verified: Delete removes memory from database permanently
- TUI: `./target/release/sibyl tui` ✓
  - Commands: `/help`, `/clear`, `/memory`, `/remember`, `/skill`, `/harness`
  - Memory panel toggle: Tab key
  - Help overlay: `?` key
  - Command palette: `:` key
  - Memory management UI: query and remember commands work, modify/delete pending (CLI available)
- Queue handling: Messages queued while processing, sent when idle ✓
- SSE: Real-time streaming with animated spinner ✓
- UX Optimization: Animated spinner for streaming indicator ✓
- Queue count: Displayed in status bar when messages are queued ✓
- SSE handling: Refactored background task for concurrent polling ✓
  - Added Clone derive to OpenCodeClient
  - Fixed Part enum to handle extra SSE event fields
  - Separate SSE polling thread with shared session state
- Bug fixes:
  - Fixed duplicate SessionIdle event handling (OpenCode sends both SessionStatus and SessionIdle)
  - Fixed "No response received" false positives when processing queued messages
- Code quality: Clippy passes with no errors ✓
- Tests: cargo test passes ✓, TUI tests 26/26 pass ✓

## TUI Testing
- tui-test framework setup in `tui-tests/` directory
- Run: `cd tui-tests && npm install && npm run test:tui`
- Tests cover: welcome screen, keybindings, help overlay, command palette, status bar, message flow
- Package: `@microsoft/tui-test ^0.0.4`
- **Note**: Node.js 25.X is NOT supported. Use Node.js 20.X LTS.
  - Install fnm: `sudo pacman -S fnm` (Arch Linux)
  - Use Node 20: `eval "$(fnm env --shell bash)" && fnm use 20`
- Tests verified (2026-04-18): 26/26 tests pass ✓
  - basic.test.ts: 6/6 passed - welcome screen, keybindings hint, command hints, help overlay, command palette, status bar
  - tests/sse-events.test.ts: 2/2 passed - SSE connection, deps visible
  - tests/single-message.test.ts: 3/3 passed - send message, queue messages, You indicator
  - tests/nonblocking.test.ts: 3/3 passed - input responsive, processing state
  - tests/messages.test.ts: 5/5 passed - message sending, queue panel, multiple messages
  - tests/queue-flow.test.ts: 4/4 passed - queue flow tests
  - tests/full-flow.test.ts: 3/3 passed - complete flow, two queued messages, queue count
  - Note: Tests run on Node.js 25.9.0 (warning about version, but tests pass)
- Code quality: Clippy passes with no errors ✓
- Build: cargo build --release succeeds ✓
- Config test: cargo test --package sibyl-deps test_load_config passes ✓

## Feature Status (from DRAFT.md)
### Implemented ✓
- Memory query and add operations (embedding-based search)
- Memory modify/delete operations (NEW - CLI + IPC + Python handlers)
- Memory list operation (NEW - CLI command)
- Automatic context injection with relevance filtering
- Subagent relevance evaluation (embedding + optional LLM)
- OpenCode harness integration (full implementation)
- Plugin system framework (skills/tools/workflows/MCP registries)

### Missing (TODO)
- Cursor, Claude Code, mCodex harness implementations
- Harness switching functionality (stub only)
- Memory management UI for modify/delete in TUI (CLI works, TUI UI pending)
- Multiple instance isolation/synchronization
- Wiki layer from LLM_WIKI.md (advanced feature)
- Plugin tools connected to Python IPC backend (stub only)

## Test Commands
```bash
# Headless mode
./target/release/sibyl run --prompt "Hello, what is 2+2?"
./target/release/sibyl run --prompt "Remember that I like Python programming" --json

# Memory operations (NEW)
./target/release/sibyl memory query --query "What programming languages does the user like?" --json
./target/release/sibyl memory list --json
./target/release/sibyl memory list --limit 10 --json
./target/release/sibyl memory modify <episode-id> --content "New content" --json
./target/release/sibyl memory delete <episode-id> --json

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
- `memory.add_user_fact` - Add user fact
- `memory.get_context` - Get context for query
- `memory.modify` - Modify existing memory (NEW)
- `memory.delete` - Delete memory (NEW)
- `memory.list` - List all memories (NEW)
- `prompt.build` - Build system prompt with memory injection
- `relevance.evaluate` - Subagent evaluates memory relevance

## Note

* **ALWAYS** make a git commit after completing a feature.
* **DO NOT** push the change.
* **ALWAYS** make sure `cargo build` working before making a commit.

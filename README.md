# Sibyl

Memory-enhanced AI coding assistant with hybrid Rust + Python architecture.

## Overview

Sibyl is a terminal-based AI coding assistant that integrates with OpenCode while maintaining persistent memory of coding sessions. It uses FalkorDB/Redis for storage and embedding-based semantic search to retrieve relevant context for conversations.

## Features

### Terminal User Interface (TUI)

A full-featured terminal UI built with ratatui:

- **Real-time SSE streaming**: Messages stream in real-time with animated spinner indicator
- **Message queue**: Queue messages while processing; they're sent sequentially when idle
- **Memory panel**: Toggle sidebar to view retrieved memories (Tab key)
- **Command palette**: Quick command access with autocomplete (: key)
- **Help overlay**: Full keybinding reference (? key)
- **Input history**: Up/Down arrow navigation through previous inputs (persistent across sessions)
- **Vim-style scrolling**: Alt+j/k, Ctrl+d/u for navigation

### Memory System

SimpleMemoryStore provides embedding-based semantic memory:

- **Semantic search**: Uses `all-MiniLM-L6-v2` embeddings (384 dimensions) for cosine similarity matching
- **No LLM dependency**: Memory storage works without LLM-based entity extraction
- **Session isolation**: Memories tagged by session ID for filtering
- **Automatic context injection**: Relevant memories retrieved and injected into prompts before sending to LLM
- **Persistence**: Memories stored in FalkorDB/Redis, surviving across sessions

### Headless Mode

Run one-shot queries without the TUI:

```bash
sibyl run --prompt "What programming languages does the user prefer?"
sibyl run --prompt "Remember that I like Rust" --json
```

Output includes retrieved memories, LLM response, and session ID.

### Memory CLI Commands

Full memory management via CLI:

```bash
# Query memories
sibyl memory query --query "What did we discuss yesterday?"

# List all memories
sibyl memory list --limit 10

# Modify a memory
sibyl memory modify <episode-id> --content "Updated content"

# Delete a memory
sibyl memory delete <episode-id>
```

### OpenCode Integration

Full harness implementation for OpenCode:

- **Session management**: Create, cancel, list sessions
- **SSE events**: Real-time streaming with MessagePartDelta, SessionIdle, ToolUse
- **Skill loading**: Load skills from OpenCode registry
- **Configurable**: URL and model set via config file

### IPC Architecture

JSON-RPC 2.0 over Unix domain sockets:

| Method | Description |
|--------|-------------|
| `memory.query` | Semantic search for relevant memories |
| `memory.add_episode` | Store conversation as memory |
| `memory.add_user_fact` | Store explicit user fact |
| `memory.get_context` | Get memory context for prompt |
| `memory.modify` | Modify existing memory content |
| `memory.delete` | Delete memory permanently |
| `memory.list` | List all or session-filtered memories |
| `prompt.build` | Build system prompt with memory injection |
| `relevance.evaluate` | Evaluate memory relevance (embedding-based) |

## Key Bindings

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Up / Down` | Navigate input history |
| `Alt+j / Alt+k` | Scroll chat (vim-style) |
| `Ctrl+d / Ctrl+u` | Half-page scroll |
| `End` | Scroll to bottom |
| `Tab` | Toggle memory panel |
| `?` | Show help overlay |
| `:` | Open command palette |
| `Esc` | Close overlay / cancel session (double-press) |
| `Ctrl+c` | Cancel current session |

## Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| `/help` | `/h`, `/?` | Show help overlay |
| `/clear` | `/c` | Clear chat history |
| `/memory query <text>` | `/m <text>` | Search memories directly |
| `/remember <fact>` | `/r <fact>` | Store explicit user fact |
| `/skill <name>` | `/s <name>` | Load a skill from OpenCode |
| `/switch-harness <name>` | `/sh <name>` | Switch harness (stub) |

Natural language shortcuts:
- Type "Remember that I like Python" to store a fact without using `/remember`

## Configuration

Config file: `~/.config/sibyl/config.yaml`

```yaml
harness:
  default: opencode
  opencode:
    url: http://localhost:4096
    model: glm-5

ipc:
  socket_path: /tmp/sibyl-ipc.sock

ui:
  history_size: 100

dependencies:
  python_ipc:
    mode: auto
    spawn_command: python -u -m sibyl_ipc_server.__main_optimized__
    startup_timeout: 15s
```

## Quick Start

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- Python 3.10+ with `sentence-transformers`, `jinja2`, `httpx`
- Docker (for FalkorDB)
- OpenCode running locally (`opencode` at configurable URL)

### Setup

1. **Start FalkorDB**:
   ```bash
   docker run -d -p 6379:6379 falkordb/falkordb
   ```

2. **Install Python dependencies**:
   ```bash
   cd python
   pip install -e .
   ```

3. **Build and run**:
   ```bash
   cargo build --release
   ./target/release/sibyl tui
   ```

   Sibyl auto-starts the Python IPC server.

## Usage Examples

### TUI Mode

```bash
# Start TUI
sibyl tui

# Start TUI with debug logging
sibyl tui --log
sibyl tui --log-file /tmp/sibyl-debug.log
```

### Headless Mode

```bash
# One-shot query
sibyl run --prompt "Hello, what is 2+2?"

# Remember a fact
sibyl run --prompt "Remember that I prefer functional programming" --json

# JSON output for scripting
sibyl run --prompt "What's the project structure?" --json | jq '.response'
```

### Memory Management

```bash
# Search memories naturally
sibyl memory query --query "What libraries does the user use?"

# List recent memories
sibyl memory list --limit 20 --json

# Modify a memory
sibyl memory modify abc123 --content "User prefers Rust over Python now"

# Delete outdated memory
sibyl memory delete abc123
```

## Architecture

Hybrid Rust + Python:

- **Rust (TUI + orchestration)**: ratatui for UI, tokio for async, reqwest for HTTP
- **Python (memory + prompts)**: SimpleMemoryStore with FalkorDB/Redis, embedding-based search
- **IPC**: JSON-RPC 2.0 over Unix domain sockets (`/tmp/sibyl-ipc.sock`)

### Project Structure

```
sibyl/
├── crates/                  # Rust workspace
│   ├── sibyl-cli/           # CLI entry point
│   ├── sibyl-tui/           # TUI application
│   ├── sibyl-core/          # Core orchestration
│   ├── sibyl-opencode/      # OpenCode harness
│   ├── sibyl-ipc/           # IPC protocol/client
│   ├── sibyl-harness/       # Harness trait
│   ├── sibyl-plugin/        # Plugin system (skills/tools/MCP)
│   └── sibyl-deps/          # Dependency management
├── python/                  # Python components
│   ├── sibyl_memory/        # SimpleMemoryStore + FalkorDB
│   ├── sibyl_prompt/        # Prompt assembly
│   ├── sibyl_relevance/     # Relevance evaluation
│   └── sibyl_ipc_server/    # IPC server
├── tui-tests/               # TUI automated tests
└── config/                  # Sample configs
```

## Performance

Headless IPC metrics (typical):

| Operation | Time |
|-----------|------|
| IPC connect | <1ms |
| Memory add_episode | ~14ms |
| Memory query | ~13ms |
| Memory get_context | ~13ms |
| Prompt build | ~164ms (cached) |
| Relevance evaluate | ~26ms |
| Embedder init | ~8s (one-time) |

## Development

```bash
# Build
cargo build --release

# Run tests
cargo test

# Run TUI tests (requires Node.js 20.X)
cd tui-tests
npm install
npm run test:tui

# Debug logging
RUST_LOG=debug cargo run
```

## Testing

TUI tests use `@microsoft/tui-test`:

```bash
cd tui-tests
npm install
npm run test:tui  # 26 tests
```

Note: Node.js 25.X not supported. Use Node.js 20.X LTS.

## License

MIT
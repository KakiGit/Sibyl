# Sibyl

Memory-enhanced coding assistant with hybrid Rust + Python architecture.

## Overview

Sibyl provides a TUI interface that integrates with OpenCode (or other coding assistants) while maintaining persistent memory of coding sessions using Graphiti + FalkorDB.

## Architecture

- **Rust**: TUI (ratatui), core orchestration, harness integration, plugins
- **Python**: Memory system (Graphiti + FalkorDB), prompt building, relevance evaluation
- **IPC**: JSON-RPC 2.0 over Unix domain sockets

## Quick Start

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- Python 3.10+
- Docker (for FalkorDB)
- OpenCode running locally

### Setup

1. **Start FalkorDB and Ollama**:
   ```bash
   docker-compose up -d
   ```

2. **Install Python dependencies**:
   ```bash
   cd python
   pip install -e .
   ```

3. **Pull Ollama model** (for relevance evaluation):
   ```bash
   docker exec sibyl-ollama ollama pull llama3.2
   ```

4. **Start the IPC server**:
   ```bash
   python -m sibyl_ipc_server
   ```

5. **Build and run Sibyl TUI**:
   ```bash
   cargo build
   cargo run --package sibyl-tui
   ```

## Configuration

Configuration is loaded from `.sibyl/sibyl.yaml` or `~/.config/sibyl/sibyl.yaml`:

```yaml
harness:
  default: opencode
  opencode:
    url: http://localhost:8080

memory:
  backend: falkordb
  host: localhost
  port: 6379

ipc:
  socket_path: /tmp/sibyl-ipc.sock
```

## IPC Methods

| Method | Description |
|--------|-------------|
| `memory.query` | Search relevant memories |
| `memory.add_episode` | Ingest conversation |
| `memory.get_context` | Get memory context for prompt |
| `prompt.build` | Build system prompt with memory injection |
| `relevance.evaluate` | Subagent evaluates memory relevance |

## Key Bindings

| Key | Action |
|-----|--------|
| `Tab` | Toggle memory panel |
| `Ctrl+C` | Quit |
| `Enter` | Send message |
| `Esc` | Clear input / close overlay |
| `Ctrl+P` | Command palette |
| `?` | Help overlay |

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/clear` | Clear chat |
| `/memory <query>` | Query memory directly |
| `/skill <name>` | Load a skill |
| `/harness <name>` | Switch harness |

## Project Structure

```
sibyl/
├── crates/              # Rust workspace
│   ├── sibyl-tui/       # TUI application
│   ├── sibyl-core/      # Core orchestration
│   ├── sibyl-opencode/  # OpenCode harness
│   ├── sibyl-ipc/       # IPC communication
│   ├── sibyl-harness/   # Harness trait
│   └── sibyl-plugin/    # Plugin system
├── python/              # Python components
│   ├── sibyl_memory/    # Graphiti + FalkorDB
│   ├── sibyl_prompt/    # Prompt assembly
│   ├── sibyl_relevance/ # Relevance evaluation
│   └── sibyl_ipc_server/
├── plugins/             # Built-in plugins
└── specs/               # Implementation specs
```

## Development

```bash
# Run with logging
RUST_LOG=debug cargo run --package sibyl-tui

# Run Python server with debug
python -m sibyl_ipc_server --log-level debug

# Run tests
cargo test
pytest python/
```

## License

MIT
# Sibyl Architecture Specification

## Overview

Sibyl is a TUI-based unified interface for LLM-based code generation tools with a built-in memory system and plugin support.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TUI Layer (Rust)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Chat UI   │  │  Memory UI  │  │    Plugin/Skill Panel   │ │
│  │  (Ratatui)  │  │  (Query)    │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (JSON-RPC/Unix Socket)
┌───────────────────────────┴─────────────────────────────────────┐
│                       Core Layer (Rust)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Session   │  │   Harness   │  │      Plugin Manager     │ │
│  │   Manager   │  │   Router    │  │                         │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘ │
│                          │                                      │
│  ┌───────────────────────┴───────────────────────────────────┐ │
│  │                    OpenCode Harness                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐ │ │
│  │  │ REST Client│  │ WebSocket  │  │   Session Sync       │ │ │
│  │  │            │  │  Events    │  │                      │ │ │
│  │  └────────────┘  └────────────┘  └──────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (JSON-RPC)
┌───────────────────────────┴─────────────────────────────────────┐
│                    Memory Layer (Python)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Graphiti Core                             ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ ││
│  │  │  Episode   │  │   Entity   │  │   Temporal Fact        │ ││
│  │  │  Ingestion │  │ Extraction │  │   Management           │ ││
│  │  └────────────┘  └────────────┘  └────────────────────────┘ ││
│  └─────────────────────────────┬───────────────────────────────┘│
│                                │                                 │
│  ┌─────────────────────────────┴───────────────────────────────┐│
│  │                    FalkorDB Driver                           ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ ││
│  │  │ Graph Store│  │  Embedding │  │   Hybrid Search        │ ││
│  │  │            │  │  (Local)   │  │   (Vector + Graph)     │ ││
│  │  └────────────┘  └────────────┘  └────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (JSON-RPC)
┌───────────────────────────┴─────────────────────────────────────┐
│                 Prompt Building Layer (Python)                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                 Subagent Relevance Evaluator                 ││
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ ││
│  │  │ Context    │  │  Memory    │  │   Prompt Assembler     │ ││
│  │  │ Analysis   │  │  Relevance │  │                        │ ││
│  │  └────────────┘  └────────────┘  └────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Component Layers

| Layer | Language | Primary Responsibility |
|-------|----------|------------------------|
| TUI | Rust (Ratatui) | User interface, keyboard handling, rendering |
| Core | Rust | Session orchestration, harness routing, plugin management |
| Memory | Python (Graphiti) | Context graph construction, temporal facts, entity extraction |
| Prompt | Python | Memory relevance evaluation, prompt assembly |
| Harness | Rust/Python | OpenCode API communication, event handling |

## Data Flow

### Query Flow
```
User Query → TUI → Core → Memory Query (Graphiti) → Relevance Evaluation → 
Prompt Assembly → OpenCode Session → Response → TUI Render
```

### Memory Ingestion Flow
```
Conversation Episode → Graphiti Ingestion → Entity Extraction → 
Fact Creation → Temporal Validation → FalkorDB Storage
```

## IPC Communication

### Rust ↔ Python Bridge
- **Transport**: Unix domain socket (Linux/macOS) or named pipe (Windows)
- **Protocol**: JSON-RPC 2.0
- **Messages**:
  - `memory.query` - Search relevant memories
  - `memory.add_episode` - Ingest conversation
  - `memory.get_context` - Assemble context for prompt
  - `prompt.build` - Build system prompt with memory injection
  - `relevance.evaluate` - Subagent evaluates memory relevance

### Core ↔ OpenCode Bridge
- **Transport**: HTTP REST + WebSocket
- **Protocol**: OpenCode REST API + Event streaming
- **Endpoints**:
  - `POST /session/:id/message` - Send prompt
  - `GET /session/:id/message` - Get messages
  - `WebSocket /event` - Real-time events

## Directory Structure

```
sibyl/
├── crates/                    # Rust workspace
│   ├── sibyl-tui/            # TUI application
│   ├── sibyl-core/           # Core orchestration
│   ├── sibyl-harness/        # Harness abstraction
│   ├── sibyl-opencode/       # OpenCode harness implementation
│   ├── sibyl-ipc/            # IPC communication layer
│   └── sibyl-plugin/         # Plugin system
├── python/                    # Python components
│   ├── sibyl_memory/         # Graphiti + FalkorDB integration
│   ├── sibyl_prompt/         # Prompt building + subagent
│   └── sibyl_ipc_server/     # Python IPC server
├── plugins/                   # Built-in plugins
│   ├── skills/               # Skill definitions
│   └── workflows/            # Workflow templates
├── config/                    # Configuration files
└── specs/                     # Implementation specifications
```

## Key Design Decisions

1. **Hybrid Rust + Python**: Rust for performance (TUI, core), Python for flexibility (memory, LLM operations)
2. **IPC Bridge**: Separates concerns cleanly, allows independent development
3. **Graphiti + FalkorDB**: Temporal context graphs for evolving code knowledge
4. **OpenCode as first harness**: REST API is well-documented and stable
5. **Plugin system**: Skills/tools/workflows portable across harnesses

## Reference Implementations

| Project | Key Learnings |
|---------|---------------|
| `~/Github/claw-code` | Rust TUI patterns, Python prompt building, IPC bridge design |
| `~/Github/opencode` | REST API structure, session management, skill system |
| `~/Github/codex` | JSONL session persistence, MCP server integration |
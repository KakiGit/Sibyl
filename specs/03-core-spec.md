# Core Layer Specification

## Responsibilities

1. Session lifecycle management
2. Harness routing and communication
3. Plugin loading and execution
4. IPC coordination with Python layers
5. Configuration management

## Core Modules

### Session Manager

Tracks conversation sessions and their states.

```rust
pub struct SessionManager {
    sessions: HashMap<SessionId, Session>,
    active_session: Option<SessionId>,
    storage: SessionStorage,
}

pub struct Session {
    pub id: SessionId,
    pub harness: HarnessType,
    pub harness_session_id: String,    // External session ID (OpenCode)
    pub created_at: DateTime,
    pub messages: Vec<Message>,
    pub state: SessionState,
}

pub enum SessionState {
    Idle,
    Processing,
    WaitingPermission,
    Error,
}
```

### Harness Router

Routes messages to the appropriate harness implementation.

```rust
pub struct HarnessRouter {
    harnesses: HashMap<HarnessType, Box<dyn Harness>>,
    active: HarnessType,
}

impl HarnessRouter {
    pub fn route_message(&self, session: &Session, prompt: Prompt) -> Result<ResponseStream> {
        let harness = self.harnesses.get(&session.harness)?;
        harness.send_message(session.harness_session_id, prompt)
    }
}
```

### IPC Bridge

Communicates with Python memory and prompt layers.

```rust
pub struct IpcBridge {
    socket: UnixSocket,
    pending_requests: HashMap<u64, PendingRequest>,
}

impl IpcBridge {
    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let request = JsonRpcRequest::new(method, params);
        self.socket.send(&request)?;
        self.wait_response(request.id).await
    }
}
```

## Harness Trait

Defines the interface for all harness implementations.

```rust
pub trait Harness: Send + Sync {
    /// Create a new session in this harness
    async fn create_session(&self, config: SessionConfig) -> Result<SessionId>;
    
    /// Send a message to the session
    async fn send_message(&self, session_id: &str, prompt: Prompt) -> Result<ResponseStream>;
    
    /// Get event stream for the session
    async fn get_events(&self, session_id: &str) -> Result<EventStream>;
    
    /// Abort current operation
    async fn abort(&self, session_id: &str) -> Result<()>;
    
    /// Fork session to new session
    async fn fork_session(&self, session_id: &str) -> Result<SessionId>;
    
    /// List available tools
    fn list_tools(&self) -> Vec<ToolSpec>;
    
    /// Harness name
    fn name(&self) -> &str;
    
    /// Check if harness is available
    fn is_available(&self) -> bool;
}
```

## Rust Crate Structure

```
sibyl-core/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── session/
│   │   ├── mod.rs
│   │   ├── manager.rs        # Session CRUD operations
│   │   ├── state.rs          # Session state tracking
│   │   ├── persistence.rs    # JSONL file storage
│   │   └── types.rs          # Session-related types
│   ├── harness/
│   │   ├── mod.rs
│   │   ├── trait.rs          # Harness abstraction trait
│   │   ├── router.rs         # Message routing logic
│   │   ├── registry.rs       # Available harness registry
│   │   └── types.rs          # Harness-related types
│   ├── ipc/
│   │   ├── mod.rs
│   │   ├── server.rs         # Unix socket server (for Python)
│   │   ├── client.rs         # IPC client (calls Python)
│   │   ├── protocol.rs       # JSON-RPC types
│   │   ├── handler.rs        # Request handlers
│   │   └── types.rs          # IPC-related types
│   ├── plugin/
│   │   ├── mod.rs
│   │   ├── loader.rs         # Plugin/skill discovery
│   │   ├── executor.rs       # Plugin execution
│   │   ├── registry.rs       # Skill/tool registry
│   │   └── skill.rs          # Skill parsing (SKILL.md)
│   ├── config/
│   │   ├── mod.rs
│   │   ├── loader.rs         # YAML config loading
│   │   ├── defaults.rs       # Default configuration
│   │   └── types.rs          # Config types
│   └── error.rs              # Error definitions
```

## Session Persistence (JSONL Format)

Learned from codex's session storage approach.

```jsonl
{"type":"session_created","id":"sess-123","timestamp":"2024-01-15T10:30:00Z","harness":"opencode"}
{"type":"message","role":"user","content":"Fix the bug","session":"sess-123","timestamp":"2024-01-15T10:30:05Z"}
{"type":"memory_injected","facts":["User prefers dark mode"],"session":"sess-123","timestamp":"2024-01-15T10:30:06Z"}
{"type":"message","role":"assistant","content":"Fixed in src/main.rs","session":"sess-123","timestamp":"2024-01-15T10:30:15Z"}
{"type":"episode_ingested","episode_id":"ep-456","session":"sess-123","timestamp":"2024-01-15T10:30:20Z"}
```

## IPC Protocol

### Request Format (JSON-RPC 2.0)

```json
{
    "jsonrpc": "2.0",
    "method": "memory.query",
    "params": {
        "query": "user preferences for editor",
        "session_id": "sess-123",
        "limit": 5
    },
    "id": 1
}
```

### Response Format

```json
{
    "jsonrpc": "2.0",
    "result": {
        "facts": [
            {"content": "User prefers VSCode", "valid_from": "2024-01-01", "score": 0.92},
            {"content": "User uses vim keybindings", "valid_from": "2024-01-05", "score": 0.85}
        ],
        "entities": ["user", "VSCode", "vim"]
    },
    "id": 1
}
```

### Error Response

```json
{
    "jsonrpc": "2.0",
    "error": {
        "code": -32000,
        "message": "FalkorDB connection failed",
        "data": {"retry_suggested": true}
    },
    "id": 1
}
```

## IPC Methods

| Method | Direction | Description |
|--------|-----------|-------------|
| `memory.query` | Rust → Python | Search relevant memories |
| `memory.add_episode` | Rust → Python | Ingest conversation |
| `memory.get_context` | Rust → Python | Get assembled context |
| `relevance.evaluate` | Rust → Python | Evaluate memory relevance |
| `prompt.build` | Rust → Python | Build system prompt |
| `session.sync` | Python → Rust | Sync session state |
| `event.emit` | Python → Rust | Emit event to TUI |

## Configuration Structure

```rust
pub struct Config {
    pub harness: HarnessConfig,
    pub memory: MemoryConfig,
    pub ipc: IpcConfig,
    pub ui: UiConfig,
    pub plugins: PluginConfig,
}

pub struct HarnessConfig {
    pub default: HarnessType,
    pub opencode: OpenCodeConfig,
}

pub struct OpenCodeConfig {
    pub url: String,
    pub mode: OpenCodeMode,     // Spawn, Attach, Auto
    pub port: u16,
}

pub struct MemoryConfig {
    pub backend: MemoryBackend, // FalkorDB
    pub host: String,
    pub port: u16,
    pub embedding_model: String,
}

pub struct IpcConfig {
    pub socket_path: String,
    pub timeout_ms: u64,
}
```

## Dependencies

```toml
[dependencies]
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
config = "0.14"                    # Config file parsing
directories = "5"                  # Standard paths
```
# MVP Implementation Roadmap

## Overview

MVP scope: Core + Memory + OpenCode harness

**Duration**: 8 weeks (2 weeks per phase)
**Goal**: Working TUI application with memory-enhanced coding assistance

---

## Phase 1: Foundation (Week 1-2)

### Goals
- Rust workspace setup
- Basic TUI shell
- IPC bridge prototype
- Graphiti + FalkorDB integration

### Tasks

#### 1.1 Initialize Rust Workspace

```bash
mkdir -p sibyl/crates
cd sibyl

# Create Cargo.toml workspace
cat > Cargo.toml << 'EOF'
[workspace]
members = [
    "crates/sibyl-tui",
    "crates/sibyl-core",
    "crates/sibyl-opencode",
    "crates/sibyl-ipc",
    "crates/sibyl-plugin",
]
resolver = "2"
EOF

# Initialize crates
for crate in sibyl-tui sibyl-core sibyl-opencode sibyl-ipc sibyl-plugin; do
    mkdir -p crates/$crate/src
    echo '[package]
name = "'$crate'"
version = "0.1.0"
edition = "2021"

[dependencies]' > crates/$crate/Cargo.toml
done
```

**Deliverable**: Compilable Rust workspace with empty crates

#### 1.2 Basic TUI Shell

Implement minimal TUI with:
- Empty chat window
- Input field (single line)
- Status bar showing "Sibyl MVP"

**Dependencies**:
```toml
[dependencies]
ratatui = "0.28"
crossterm = "0.28"
tokio = { version = "1", features = ["full"] }
```

**Files to create**:
- `crates/sibyl-tui/src/main.rs` - Entry point
- `crates/sibyl-tui/src/app.rs` - App state
- `crates/sibyl-tui/src/render/mod.rs` - Basic rendering

**Deliverable**: TUI that displays and accepts input (no functionality yet)

#### 1.3 IPC Bridge Prototype

Create Unix socket communication:

**Rust side** (client calling Python):
```rust
// crates/sibyl-ipc/src/client.rs
pub struct IpcClient {
    socket: UnixSocket,
}

impl IpcClient {
    pub async fn call(&self, method: &str, params: Value) -> Result<Value>;
}
```

**Python side** (server):
```python
# python/sibyl_ipc_server/server.py
class IpcServer:
    def __init__(self, socket_path: str):
        self.server = JSONRPCServer(socket_path)
    
    async def start(self):
        await self.server.start()
```

**Test**: Ping-pong over IPC
```rust
let response = ipc.call("ping", json!({})).await?;
assert_eq!(response, json!({"pong": true}));
```

**Deliverable**: Working IPC communication between Rust and Python

#### 1.4 Graphiti + FalkorDB Setup

1. Create Docker Compose for FalkorDB:
```yaml
# docker-compose.yml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"
```

2. Install Graphiti:
```bash
pip install graphiti-core[falkordb]
```

3. Create Python memory module:
```python
# python/sibyl_memory/graphiti_client.py
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver

class SibylMemory:
    def __init__(self):
        self.driver = FalkorDriver(host="localhost", port=6379)
        self.graphiti = Graphiti(graph_driver=self.driver)
    
    async def initialize(self):
        await self.graphiti.build_indices()
```

4. Test connection:
```python
memory = SibylMemory()
await memory.initialize()
await memory.graphiti.add_episode(
    name="test",
    source_description="Test episode",
    content="User prefers dark mode"
)
```

**Deliverable**: FalkorDB running, Graphiti connected, basic episode storage

---

## Phase 2: Core Features (Week 3-4)

### Goals
- Chat functionality via OpenCode
- Memory query integration
- Prompt building

### Tasks

#### 2.1 OpenCode REST Client

Implement HTTP client for OpenCode API:

```rust
// crates/sibyl-opencode/src/client/rest.rs
pub struct OpenCodeClient {
    http: reqwest::Client,
    base_url: String,
}

impl OpenCodeClient {
    pub async fn create_session(&self) -> Result<String>;
    pub async fn send_message(&self, session: &str, msg: &str) -> Result<()>;
    pub async fn get_messages(&self, session: &str) -> Result<Vec<Message>>;
}
```

**Test**: Connect to running OpenCode, create session, send message

**Deliverable**: Working OpenCode REST client

#### 2.2 WebSocket Event Handling

Implement real-time event streaming:

```rust
// crates/sibyl-opencode/src/client/websocket.rs
pub struct OpenCodeWebSocket {
    stream: WebSocketStream,
}

impl OpenCodeWebSocket {
    pub async fn connect(url: &str) -> Result<Self>;
    pub async fn next_event(&mut self) -> Result<Option<Event>>;
}
```

**Events to handle**:
- `message` - Assistant response chunks
- `tool_call` - Tool being executed
- `complete` - Response finished
- `error` - Error occurred

**Deliverable**: Real-time message streaming from OpenCode

#### 2.3 Memory Query Integration

Connect IPC to memory service:

**Add IPC handlers**:
```python
# python/sibyl_ipc_server/handlers.py
async def handle_memory_query(params: dict) -> dict:
    query = params.get("query", "")
    results = await graphiti.search(query=query, limit=5)
    return {"facts": [f.to_dict() for f in results.facts]}
```

**Call from Rust**:
```rust
// Before sending prompt to OpenCode
let memories = ipc.call("memory.query", json!({
    "query": user_input,
    "session_id": session.id
})).await?;
```

**Deliverable**: Memories queried before each prompt

#### 2.4 Prompt Building

Implement system prompt construction:

```python
# python/sibyl_prompt/builder.py
class PromptBuilder:
    def build_system_prompt(
        self,
        memories: dict,
        user_query: str
    ) -> str:
        template = load_template("system.jinja2")
        return template.render(
            memories=memories,
            user_query=user_query,
            environment=get_env_info()
        )
```

**Inject into OpenCode**: Modify OpenCode session to include Sibyl's system prompt

**Deliverable**: System prompt with memory context

#### 2.5 TUI Chat Display

Render chat messages in TUI:

```rust
// crates/sibyl-tui/src/render/chat.rs
pub fn render_chat(f: &mut Frame, messages: &[Message]) {
    for (i, msg) in messages.iter().rev().take(visible_count) {
        let text = match msg.role {
            Role::User => format!("You: {}", msg.content),
            Role::Assistant => format!("Sibyl: {}", msg.content),
        };
        // Render with appropriate styling
    }
}
```

**Support**:
- Markdown rendering (basic)
- Streaming updates
- Scroll history

**Deliverable**: Chat messages displayed in TUI

---

## Phase 3: Refinement (Week 5-6)

### Goals
- Subagent relevance evaluation
- Memory panel UI
- Basic skill support
- Episode auto-ingestion

### Tasks

#### 3.1 Relevance Evaluator

Implement subagent-based memory filtering:

```python
# python/sibyl_relevance/evaluator.py
class RelevanceEvaluator:
    def __init__(self):
        self.llm = ollama.Client()
    
    async def evaluate(self, query: str, facts: list) -> list:
        # Use llama3.2 to evaluate each fact
        scores = []
        for fact in facts:
            score = await self._score_relevance(query, fact)
            if score > 0.7:  # Threshold
                scores.append(fact)
        return scores
```

**Deliverable**: Irrelevant memories filtered out

#### 3.2 Memory Panel UI

Add collapsible panel showing injected memories:

```rust
// crates/sibyl-tui/src/render/memory.rs
pub struct MemoryPanel {
    visible: bool,
    facts: Vec<Fact>,
}

pub fn render_memory_panel(f: &mut Frame, panel: &MemoryPanel) {
    if !panel.visible {
        return;
    }
    // Render list of facts with timestamps
}
```

**Key binding**: `Tab` toggles memory panel visibility

**Deliverable**: Memory context visible in UI

#### 3.3 Episode Auto-Ingestion

After each conversation, ingest to memory:

```rust
// On message completion
let episode_content = format_conversation(&messages);
ipc.call("memory.add_episode", json!({
    "content": episode_content,
    "session_id": session.id
})).await?;
```

**Deliverable**: Conversations automatically stored in memory

#### 3.4 Skill Loading

Parse and load SKILL.md files:

```rust
// crates/sibyl-plugin/src/skill/loader.rs
pub fn load_skills(paths: &[PathBuf]) -> Vec<Skill> {
    let mut skills = vec![];
    for path in paths {
        if let Ok(content) = fs::read_to_string(path) {
            skills.push(parse_skill(content));
        }
    }
    skills
}
```

**Skill activation**: `/skill <name>` command injects skill instructions

**Deliverable**: Skills loaded and usable

---

## Phase 4: Polish (Week 7-8)

### Goals
- Error handling
- Configuration system
- Session persistence
- Documentation

### Tasks

#### 4.1 Configuration System

Load YAML config:

```rust
// crates/sibyl-core/src/config/loader.rs
pub fn load_config() -> Result<Config> {
    let config_path = find_config_path()?;  // .sibyl/config.yaml
    let content = fs::read_to_string(config_path)?;
    serde_yaml::from_str(&content)?
}
```

**Config structure**:
```yaml
harness:
  default: opencode
  opencode:
    url: http://localhost:3000

memory:
  backend: falkordb
  host: localhost
  port: 6379
```

**Deliverable**: Configurable settings

#### 4.2 Error Handling

Graceful handling of:
- IPC connection failures → Retry with backoff
- OpenCode unavailable → Show error in UI
- FalkorDB connection issues → Disable memory, continue without

```rust
// crates/sibyl-core/src/error.rs
pub enum SibylError {
    IpcConnectionFailed(SocketError),
    HarnessUnavailable(String),
    MemoryBackendError(String),
}

impl SibylError {
    pub fn user_message(&self) -> String {
        match self {
            Self::IpcConnectionFailed(_) => 
                "Memory service unavailable. Continuing without memory context.",
            Self::HarnessUnavailable(name) =>
                format!("{} harness not responding. Check if it's running.", name),
            // ...
        }
    }
}
```

**Deliverable**: User-friendly error messages

#### 4.3 Session Persistence

Save sessions to JSONL:

```rust
// crates/sibyl-core/src/session/persistence.rs
pub fn save_session(session: &Session) -> Result<()> {
    let path = session_path(session.id)?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    
    for event in session.events_since_last_save() {
        file.write_all(&serde_json::to_vec(event)?)?;
        file.write_all(b"\n")?;
    }
    Ok(())
}
```

**Restore on startup**: Load recent session from JSONL

**Deliverable**: Sessions persist across restarts

#### 4.4 Documentation

Write:
- README.md with setup instructions
- Architecture overview (link to specs)
- Skill creation guide
- Configuration reference

**Deliverable**: User-facing documentation

---

## MVP Success Criteria

At the end of Phase 4, Sibyl MVP should:

| Feature | Status |
|---------|--------|
| TUI chat interface | ✓ Working |
| OpenCode integration | ✓ Messages sent/received |
| Memory query | ✓ Facts retrieved before prompts |
| Memory display | ✓ Panel shows injected context |
| Memory ingestion | ✓ Conversations stored as episodes |
| Relevance filtering | ✓ Subagent removes irrelevant memories |
| Skills | ✓ Basic SKILL.md loading |
| Configuration | ✓ YAML config supported |
| Persistence | ✓ Sessions saved/restored |
| Error handling | ✓ Graceful degradation |

---

## Post-MVP Roadmap

### Future Enhancements (not in MVP)

1. **Additional harnesses**: Cursor, Claude Code, Codex
2. **Advanced memory**: Entity relationship visualization
3. **MCP tool integration**: External tool servers
4. **Workflow automation**: Multi-step workflows
5. **Mobile support**: Remote agent control
6. **Multi-project memory**: Cross-project context sharing

---

## Development Setup

### Prerequisites

- Rust 1.70+ (`rustup install stable`)
- Python 3.10+ (`python --version`)
- Node.js 18+ (for OpenCode)
- Docker (for FalkorDB)

### Initial Setup Commands

```bash
# 1. Clone/create project
git init sibyl

# 2. Setup Rust
cd sibyl
cargo init --workspace

# 3. Setup Python
mkdir python
cd python
python -m venv .venv
source .venv/bin/activate
pip install graphiti-core[falkordb] sentence-transformers

# 4. Start FalkorDB
docker run -d -p 6379:6379 --name falkordb falkordb/falkordb

# 5. Start OpenCode (in another terminal)
cd ~/Github/opencode
npm run dev  # or: opencode serve

# 6. Build and run Sibyl
cd sibyl
cargo build
cargo run --package sibyl-tui
```

---

## Weekly Milestones

| Week | Milestone |
|------|-----------|
| 1 | Rust workspace compiles, TUI displays |
| 2 | IPC ping-pong works, FalkorDB connected |
| 3 | OpenCode session created, message sent |
| 4 | Chat displayed in TUI, memories queried |
| 5 | Relevance evaluator working, memory panel |
| 6 | Auto-ingestion, skill loading |
| 7 | Config system, error handling |
| 8 | Session persistence, documentation |
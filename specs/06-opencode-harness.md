# OpenCode Harness Specification

## Integration Approach

OpenCode provides a **REST API + WebSocket** interface for external tools.

Key insight from opencode source: The server exposes REST endpoints for session management and WebSocket for real-time event streaming.

### API Endpoints (from opencode/server/)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session` | POST | Create new session |
| `/session/:id` | GET | Get session state |
| `/session/:id/message` | POST | Send user message |
| `/session/:id/message` | GET | Get all messages |
| `/session/:id/abort` | POST | Abort current operation |
| `/session/:id/fork` | POST | Fork session |
| `/session/:id` | DELETE | Delete session |
| `/agent` | GET | List available agents |
| `/skill` | GET | List available skills |
| `/mcp` | GET | List MCP servers |
| `/mcp/:name/start` | POST | Start MCP server |
| `/mcp/:name/stop` | POST | Stop MCP server |
| `/event` | WebSocket | Real-time event stream |

## REST Client Implementation

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};

pub struct OpenCodeClient {
    http: Client,
    base_url: String,
}

impl OpenCodeClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            http: Client::builder()
                .timeout(Duration::from_secs(120))
                .build()
                .unwrap(),
            base_url: base_url.to_string(),
        }
    }
    
    pub async fn create_session(&self, config: SessionConfig) -> Result<String> {
        let response = self.http
            .post(&format!("{}/session", self.base_url))
            .json(&config)
            .send()
            .await?;
        
        let session: SessionResponse = response.json().await?;
        Ok(session.id)
    }
    
    pub async fn send_message(
        &self,
        session_id: &str,
        message: UserMessage
    ) -> Result<()> {
        self.http
            .post(&format!(
                "{}/session/{}/message",
                self.base_url, session_id
            ))
            .json(&message)
            .send()
            .await?;
        
        Ok(())
    }
    
    pub async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        let response = self.http
            .get(&format!(
                "{}/session/{}/message",
                self.base_url, session_id
            ))
            .send()
            .await?;
        
        response.json().await
    }
    
    pub async fn abort(&self, session_id: &str) -> Result<()> {
        self.http
            .post(&format!(
                "{}/session/{}/abort",
                self.base_url, session_id
            ))
            .send()
            .await?;
        
        Ok(())
    }
    
    pub async fn fork_session(&self, session_id: &str) -> Result<String> {
        let response = self.http
            .post(&format!(
                "{}/session/{}/fork",
                self.base_url, session_id
            ))
            .send()
            .await?;
        
        let new_session: SessionResponse = response.json().await?;
        Ok(new_session.id)
    }
}
```

## WebSocket Event Handling

### Event Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OpenCodeEvent {
    #[serde(rename = "message")]
    Message { content: String, role: String },
    
    #[serde(rename = "tool_call")]
    ToolCall { name: String, arguments: Value },
    
    #[serde(rename = "tool_result")]
    ToolResult { name: String, result: Value },
    
    #[serde(rename = "permission_request")]
    PermissionRequest { id: String, tool: String, action: String },
    
    #[serde(rename = "error")]
    Error { message: String },
    
    #[serde(rename = "complete")]
    Complete { session_id: String },
    
    #[serde(rename = "stream")]
    Stream { delta: String },
}
```

### WebSocket Client

```rust
use tokio_tungstenite::{connect_async, WebSocketStream};
use futures::{StreamExt, SinkExt};

pub struct OpenCodeWebSocket {
    url: String,
    receiver: Option<WebSocketStream>,
}

impl OpenCodeWebSocket {
    pub async fn connect(base_url: &str) -> Result<Self> {
        let ws_url = base_url.replace("http", "ws") + "/event";
        let (stream, _) = connect_async(&ws_url).await?;
        
        Ok(Self {
            url: ws_url,
            receiver: Some(stream),
        })
    }
    
    pub async fn next_event(&mut self) -> Result<Option<OpenCodeEvent>> {
        if let Some(stream) = &mut self.receiver {
            while let Some(msg) = stream.next().await {
                match msg? {
                    Message::Text(text) => {
                        let event: OpenCodeEvent = serde_json::from_str(&text)?;
                        return Ok(Some(event));
                    }
                    Message::Close(_) => return Ok(None),
                    _ => continue,
                }
            }
        }
        Ok(None)
    }
}
```

## Harness Trait Implementation

```rust
use async_trait::async_trait;

pub struct OpenCodeHarness {
    client: OpenCodeClient,
    websocket: Option<OpenCodeWebSocket>,
    sessions: HashMap<String, String>,  // Sibyl ID -> OpenCode ID
}

#[async_trait]
impl Harness for OpenCodeHarness {
    async fn create_session(&self, config: SessionConfig) -> Result<SessionId> {
        let opencode_config = OpenCodeSessionConfig {
            model: config.model.clone(),
            working_directory: config.working_directory.clone(),
            skills: config.skills.clone(),
        };
        
        let opencode_id = self.client.create_session(opencode_config).await?;
        
        let sibyl_id = SessionId::new();
        self.sessions.insert(sibyl_id.to_string(), opencode_id.clone());
        
        Ok(sibyl_id)
    }
    
    async fn send_message(
        &self,
        session_id: &str,
        prompt: Prompt
    ) -> Result<ResponseStream> {
        let opencode_id = self.sessions.get(session_id)?;
        
        self.client.send_message(opencode_id, UserMessage {
            role: "user",
            content: prompt.content,
        }).await?;
        
        // Stream response via WebSocket
        Ok(ResponseStream::WebSocket(self.websocket.as_mut().unwrap()))
    }
    
    async fn get_events(&self, session_id: &str) -> Result<EventStream> {
        // Events come through WebSocket, filtered by session
        Ok(EventStream::WebSocket(self.websocket.as_mut().unwrap()))
    }
    
    async fn abort(&self, session_id: &str) -> Result<()> {
        let opencode_id = self.sessions.get(session_id)?;
        self.client.abort(opencode_id).await?;
        Ok(())
    }
    
    async fn fork_session(&self, session_id: &str) -> Result<SessionId> {
        let opencode_id = self.sessions.get(session_id)?;
        let new_opencode_id = self.client.fork_session(opencode_id).await?;
        
        let new_sibyl_id = SessionId::new();
        self.sessions.insert(new_sibyl_id.to_string(), new_opencode_id);
        
        Ok(new_sibyl_id)
    }
    
    fn list_tools(&self) -> Vec<ToolSpec> {
        // OpenCode tools come from its tool registry
        vec![
            ToolSpec { name: "read_file", description: "Read file contents" },
            ToolSpec { name: "write_file", description: "Write to file" },
            ToolSpec { name: "bash", description: "Execute bash command" },
            ToolSpec { name: "grep", description: "Search files" },
        ]
    }
    
    fn name(&self) -> &str {
        "opencode"
    }
    
    fn is_available(&self) -> bool {
        // Check if OpenCode server is reachable
        self.client.health_check().await.is_ok()
    }
}
```

## Session Synchronization

### Data Flow

```
┌──────────────┐     ┌──────────────┐
│  Sibyl Core  │────►│  OpenCode    │
│  (Session    │     │  (Session    │
│   Manager)   │◄────│   Storage)   │
└──────────────┘     └──────────────┘
        │                   │
        │                   │
        ▼                   ▼
┌──────────────┐     ┌──────────────┐
│  Memory DB   │     │  OpenCode    │
│  (Episodes)  │◄────│  Messages    │
└──────────────┘     └──────────────┘
```

### Sync Strategy

1. **On Message Complete**: Ingest conversation to memory
2. **On Fork**: Copy relevant memories to new session
3. **On Abort**: Mark episode as incomplete

```rust
impl SessionSync {
    pub async fn sync_message_complete(
        &self,
        sibyl_session: &str,
        opencode_session: &str
    ) -> Result<()> {
        // Get messages from OpenCode
        let messages = self.opencode_client
            .get_messages(opencode_session)
            .await?;
        
        // Send to memory for ingestion
        let episode_content = self.format_episode(&messages);
        self.ipc_bridge.call("memory.add_episode", json!({
            "content": episode_content,
            "session_id": sibyl_session,
            "source": "opencode"
        })).await?;
        
        Ok(())
    }
}
```

## Configuration

```yaml
# config/sibyl.yaml
harness:
  default: opencode
  
  opencode:
    # Connection settings
    url: http://localhost:3000
    mode: attach              # attach | spawn
    
    # Spawn settings (if mode = spawn)
    spawn:
      command: opencode serve
      port: 3000
      wait_timeout: 10s
    
    # Model settings
    model: default            # Use OpenCode's configured model
    # Or override:
    # model: claude-3-opus
    
    # Skill integration
    skills_dir: .sibyl/skills
    load_skills: true
```

## Starting OpenCode

### Attach Mode (OpenCode already running)

```bash
# User starts OpenCode manually
opencode serve --port 3000

# Sibyl attaches to it
sibyl --harness opencode
```

### Spawn Mode (Sibyl starts OpenCode)

```rust
impl OpenCodeHarness {
    pub async fn spawn_opencode(&self, config: &SpawnConfig) -> Result<()> {
        let mut cmd = Command::new("opencode");
        cmd.arg("serve")
            .arg("--port")
            .arg(config.port.to_string());
        
        let child = cmd.spawn()?;
        
        // Wait for server to be ready
        for _ in 0..config.wait_timeout.iterations() {
            if self.health_check().await.is_ok() {
                return Ok(());
            }
            sleep(config.wait_timeout.interval).await;
        }
        
        Err(Error::Timeout("OpenCode server did not start"))
    }
}
```

## Permission Handling

OpenCode may request permissions for certain operations (file writes, bash commands).

```rust
pub enum PermissionDecision {
    Allow,
    Deny,
    AllowAlways,  // Remember in memory
}

impl OpenCodeHarness {
    async fn handle_permission_request(
        &self,
        request: PermissionRequest,
        session_id: &str
    ) -> Result<PermissionDecision> {
        // 1. Check memory for past decisions on similar actions
        let past_decisions = self.ipc_bridge.call(
            "memory.query",
            json!({"query": format!("permission for {}", request.action)})
        ).await?;
        
        // 2. If "always allow" in memory, return AllowAlways
        if has_always_allow(&past_decisions) {
            return Ok(PermissionDecision::AllowAlways);
        }
        
        // 3. Otherwise, prompt user via TUI
        let decision = self.tui.prompt_permission(request).await?;
        
        // 4. If user chose "always allow", store in memory
        if decision == PermissionDecision::AllowAlways {
            self.ipc_bridge.call(
                "memory.add_episode",
                json!({"content": format!("Always allow {}", request.action)})
            ).await?;
        }
        
        Ok(decision)
    }
}
```

## Crate Structure

```
sibyl-opencode/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── harness.rs           # Harness trait impl
│   ├── client/
│   │   ├── mod.rs
│   │   ├── rest.rs          # HTTP client
│   │   ├── websocket.rs     # WebSocket client
│   │   └── types.rs         # Request/response types
│   ├── session/
│   │   ├── mod.rs
│   │   ├── sync.rs          # Session sync logic
│   │   └── mapping.rs       # ID mapping
│   ├── permissions/
│   │   ├── mod.rs
│   │   ├── handler.rs       # Permission handling
│   │   └── memory.rs        # Permission memory
│   ├── spawn/
│   │   ├── mod.rs
│   │   ├── process.rs       # Process spawning
│   │   ├── health.rs        # Health check
│   └── config.rs            # OpenCode-specific config
```

## Dependencies

```toml
[dependencies]
reqwest = { version = "0.12", features = ["json"] }
tokio-tungstenite = "0.24"
futures = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
async-trait = "0.1"
thiserror = "1"
tracing = "0.1"
```
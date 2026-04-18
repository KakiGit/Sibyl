use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OpenCodeEvent {
    #[serde(rename = "server.connected")]
    ServerConnected {
        #[serde(default)]
        properties: serde_json::Value,
    },

    #[serde(rename = "server.heartbeat")]
    ServerHeartbeat {
        #[serde(default)]
        properties: serde_json::Value,
    },

    #[serde(rename = "session.created")]
    SessionCreated {
        #[serde(rename = "properties")]
        properties: SessionCreatedProperties,
    },

    #[serde(rename = "session.status")]
    SessionStatus {
        #[serde(rename = "properties")]
        properties: SessionStatusProperties,
    },

    #[serde(rename = "session.idle")]
    SessionIdle {
        #[serde(rename = "properties")]
        properties: SessionIdleProperties,
    },

    #[serde(rename = "session.updated")]
    SessionUpdated {
        #[serde(rename = "properties")]
        properties: SessionUpdatedProperties,
    },

    #[serde(rename = "session.diff")]
    SessionDiff {
        #[serde(rename = "properties")]
        properties: SessionDiffProperties,
    },

    #[serde(rename = "sync")]
    Sync {
        #[serde(rename = "syncEvent")]
        sync_event: SyncEvent,
    },

    #[serde(rename = "message.updated")]
    MessageUpdated {
        #[serde(rename = "properties")]
        properties: MessageUpdatedProperties,
    },

    #[serde(rename = "message.part.updated")]
    MessagePartUpdated {
        #[serde(rename = "properties")]
        properties: MessagePartUpdatedProperties,
    },

    #[serde(rename = "message.part.delta")]
    MessagePartDelta {
        #[serde(rename = "properties")]
        properties: MessagePartDeltaProperties,
    },

    #[serde(rename = "session.error")]
    SessionError {
        #[serde(rename = "properties")]
        properties: SessionErrorProperties,
    },

    #[serde(rename = "permission.asked")]
    PermissionAsked {
        #[serde(rename = "properties")]
        properties: PermissionAskedProperties,
    },

    #[serde(rename = "file.watcher.updated")]
    FileWatcherUpdated {
        #[serde(default)]
        properties: serde_json::Value,
    },

    #[serde(rename = "message")]
    Message { content: String, role: String },

    #[serde(rename = "tool_call")]
    ToolCall {
        name: String,
        arguments: serde_json::Value,
    },

    #[serde(rename = "tool_result")]
    ToolResult {
        name: String,
        result: serde_json::Value,
    },

    #[serde(rename = "permission_request")]
    PermissionRequest {
        id: String,
        tool: String,
        action: String,
    },

    #[serde(rename = "error")]
    Error { message: String },

    #[serde(rename = "complete")]
    Complete { session_id: String },

    #[serde(rename = "stream")]
    Stream { delta: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCreatedProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub info: SessionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatusProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub status: SessionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SessionStatus {
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "busy")]
    Busy,
    #[serde(rename = "retry")]
    Retry {
        attempt: u32,
        message: String,
        next: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionIdleProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUpdatedProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub info: SessionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    #[serde(rename = "sessionID", default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub directory: Option<String>,
    #[serde(default)]
    pub summary: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDiffProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    #[serde(default)]
    pub diff: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEvent {
    #[serde(rename = "aggregateID")]
    pub aggregate_id: String,
    #[serde(default)]
    pub data: serde_json::Value,
    pub id: String,
    #[serde(default)]
    pub seq: u64,
    #[serde(rename = "type")]
    pub event_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageUpdatedProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub info: MessageInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageInfo {
    pub id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub role: MessageRole,
    #[serde(default)]
    pub time: MessageTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageTime {
    #[serde(default)]
    pub created: u64,
    #[serde(default)]
    pub completed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePartUpdatedProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub part: Part,
    #[serde(default)]
    pub time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePartDeltaProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    #[serde(rename = "messageID")]
    pub message_id: String,
    #[serde(rename = "partID")]
    pub part_id: String,
    pub field: String,
    pub delta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Part {
    #[serde(rename = "text")]
    Text {
        id: String,
        #[serde(rename = "messageID", default)]
        message_id: Option<String>,
        #[serde(rename = "sessionID", default)]
        session_id: Option<String>,
        text: String,
        #[serde(default)]
        time: Option<PartTime>,
    },
    #[serde(rename = "reasoning")]
    Reasoning {
        id: String,
        #[serde(rename = "messageID", default)]
        message_id: Option<String>,
        #[serde(rename = "sessionID", default)]
        session_id: Option<String>,
        text: String,
        #[serde(default)]
        time: Option<PartTime>,
    },
    #[serde(rename = "tool")]
    Tool {
        id: String,
        #[serde(rename = "messageID", default)]
        message_id: Option<String>,
        #[serde(rename = "sessionID", default)]
        session_id: Option<String>,
        tool: String,
        #[serde(default)]
        state: Option<ToolState>,
    },
    #[serde(rename = "step-start")]
    StepStart {
        id: String,
        #[serde(default)]
        message_id: Option<String>,
        #[serde(rename = "sessionID", default)]
        session_id: Option<String>,
    },
    #[serde(rename = "step-finish")]
    StepFinish {
        id: String,
        #[serde(rename = "messageID", default)]
        message_id: Option<String>,
        #[serde(rename = "sessionID", default)]
        session_id: Option<String>,
        #[serde(default)]
        reason: Option<String>,
        #[serde(default)]
        tokens: Option<serde_json::Value>,
        #[serde(default)]
        cost: Option<f64>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartTime {
    #[serde(default)]
    pub start: u64,
    #[serde(default)]
    pub end: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolState {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionErrorProperties {
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub error: ErrorInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorInfo {
    pub name: String,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionAskedProperties {
    pub id: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    pub permission: String,
    #[serde(default)]
    pub patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub model: Option<String>,
    pub working_directory: Option<String>,
    pub skills: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessage {
    pub role: String,
    pub parts: Vec<MessagePart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: String,
}

impl UserMessage {
    pub fn new(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            parts: vec![MessagePart {
                part_type: "text".to_string(),
                text: content.into(),
            }],
        }
    }

    pub fn with_context(content: impl Into<String>, context: &str) -> Self {
        let full_text = if context.is_empty() {
            content.into()
        } else {
            format!("{}\n\n{}", context, content.into())
        };
        Self {
            role: "user".to_string(),
            parts: vec![MessagePart {
                part_type: "text".to_string(),
                text: full_text,
            }],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerInfo {
    pub name: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForkResponse {
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionDecision {
    Allow,
    Deny,
    AllowAlways,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub decision: PermissionDecision,
    pub request_id: String,
}

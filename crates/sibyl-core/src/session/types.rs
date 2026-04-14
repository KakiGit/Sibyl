use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SessionId(String);

impl SessionId {
    pub fn new() -> Self {
        Self(format!("sess-{}", Uuid::new_v4()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn from_str(s: String) -> Self {
        Self(s)
    }
}

impl Default for SessionId {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionState {
    Idle,
    Processing,
    WaitingPermission,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HarnessType {
    OpenCode,
}

impl Default for HarnessType {
    fn default() -> Self {
        Self::OpenCode
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: SessionId,
    pub harness: HarnessType,
    pub harness_session_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub messages: Vec<Message>,
    pub state: SessionState,
    pub project_path: Option<std::path::PathBuf>,
}

impl Session {
    pub fn new(project_path: Option<std::path::PathBuf>) -> Self {
        Self {
            id: SessionId::new(),
            harness: HarnessType::default(),
            harness_session_id: None,
            created_at: chrono::Utc::now(),
            messages: Vec::new(),
            state: SessionState::Idle,
            project_path,
        }
    }

    pub fn with_harness(mut self, harness: HarnessType) -> Self {
        self.harness = harness;
        self
    }

    pub fn set_harness_session_id(&mut self, id: String) {
        self.harness_session_id = Some(id);
    }

    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
    }

    pub fn set_state(&mut self, state: SessionState) {
        self.state = state;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl Message {
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: content.into(),
            timestamp: chrono::Utc::now(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Role {
    User,
    Assistant,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SessionEvent {
    SessionCreated {
        id: SessionId,
        timestamp: chrono::DateTime<chrono::Utc>,
        harness: HarnessType,
    },
    Message {
        role: Role,
        content: String,
        session: SessionId,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    MemoryInjected {
        facts: Vec<String>,
        session: SessionId,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    EpisodeIngested {
        episode_id: String,
        session: SessionId,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
    StateChanged {
        state: SessionState,
        session: SessionId,
        timestamp: chrono::DateTime<chrono::Utc>,
    },
}
